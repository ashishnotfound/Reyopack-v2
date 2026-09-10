alter table public.sync_runs
  add column sync_version integer not null default 1,
  add column window_start timestamptz,
  add column window_end timestamptz,
  add column records_fetched integer not null default 0,
  add column records_added integer not null default 0,
  add column records_updated integer not null default 0,
  add column records_unchanged integer not null default 0,
  add column records_failed integer not null default 0;

create table public.sync_failures (
  id bigint generated always as identity primary key,
  sync_run_id uuid not null references public.sync_runs(id) on delete cascade,
  stage text not null check (stage in ('request','normalization','order')),
  page_number integer check (page_number is null or page_number > 0),
  amazon_order_id text,
  request_context jsonb not null default '{}'::jsonb,
  error_message text not null,
  created_at timestamptz not null default now()
);
create index sync_failures_run_created_idx on public.sync_failures(sync_run_id, created_at desc);
alter table public.sync_failures enable row level security;
grant select on public.sync_failures to authenticated;
grant select, insert on public.sync_failures to service_role;
grant usage, select on sequence public.sync_failures_id_seq to service_role;
create policy sync_failures_admin_read on public.sync_failures for select to authenticated using (private.is_admin());

-- Earlier code treated a v2026 response as complete after its first 100 records.
-- Force the corrected implementation to begin with a clean, full backfill window.
update public.sync_runs
set status='failed', finished_at=coalesce(finished_at,now()),
  error_message=left(coalesce(error_message||' ', '')||'Superseded by complete-pagination sync version 2.',500)
where status='running';

-- A carrier can legitimately use one tracking number for more than one Amazon order.
drop index public.orders_awb_unique_idx;
create index orders_awb_unique_idx on public.orders(awb) where awb is not null and awb <> '';

create or replace function private.preserve_order_progress() returns trigger language plpgsql set search_path='' as $$
begin
  if new.marketplace_updated_at is distinct from old.marketplace_updated_at
    and new.marketplace_updated_at < old.marketplace_updated_at then return old; end if;
  if old.state='packed' and new.state='pending' then
    new.state := 'packed';
    new.packed_at := coalesce(new.packed_at,old.packed_at);
  end if;
  if old.state='cancelled' then
    new.state := 'cancelled';
    new.cancelled_at := coalesce(new.cancelled_at,old.cancelled_at,old.marketplace_updated_at,old.updated_at,now());
  end if;
  return new;
end $$;

create or replace function public.worker_workload(p_filter text default 'all', p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if auth.uid() is null or private.current_user_role() is null then
    raise exception 'Unauthorized' using errcode='42501';
  end if;
  if p_page is null or p_page < 1 or p_filter is null or p_filter not in ('all','today','upcoming','unpacked','packed','waiting','overdue') then
    raise exception 'Invalid workload filter or page';
  end if;
  with eligible as materialized (
    select o.*, case
      when not handed_over and ship_by_date < today and state <> 'packed' then 0
      when not handed_over and ship_by_date = today and state <> 'packed' then 1
      when not handed_over and ship_by_date < today then 2
      when not handed_over and ship_by_date = today then 3
      when not handed_over then 4 else 5 end as urgency
    from public.orders o
    where state <> 'cancelled' and upper(coalesce(marketplace_status,'')) not in ('CANCELLED','UNFULFILLABLE')
      and upper(coalesce(raw_payload #>> '{fulfillment,fulfilledBy}','MERCHANT')) <> 'AMAZON'
  ), matching as materialized (
    select * from eligible where case p_filter
      when 'all' then true
      when 'today' then ship_by_date=today and not handed_over
      when 'upcoming' then ship_by_date>today and not handed_over
      when 'unpacked' then state<>'packed' and not handed_over
      when 'packed' then state='packed'
      when 'waiting' then state='packed' and not handed_over
      when 'overdue' then ship_by_date<today and not handed_over end
  ), page as (
    select id,ship_by_date,handed_over,marketplace_status,urgency from matching
    order by urgency,ship_by_date nulls last,created_at,id limit 50 offset (p_page::bigint-1)*50
  )
  select jsonb_build_object(
    'date',today,'page',p_page,'pageSize',50,'total',(select count(*) from matching),
    'counts',(select jsonb_build_object(
      'today',count(*) filter(where ship_by_date=today and not handed_over),
      'unpacked',count(*) filter(where ship_by_date=today and state<>'packed' and not handed_over),
      'packed',count(*) filter(where ship_by_date=today and state='packed' and not handed_over),
      'waiting',count(*) filter(where state='packed' and not handed_over),
      'overdue',count(*) filter(where ship_by_date<today and not handed_over),
      'totalOrders',count(*) filter(where not handed_over)) from eligible),
    'orders',coalesce((select jsonb_agg(private.order_json(id)||jsonb_build_object(
      'shipByDate',ship_by_date,'handedOver',handed_over,'marketplaceStatus',marketplace_status)
      order by urgency,ship_by_date nulls last,id) from page),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.worker_workload(text,integer) from public,anon;
grant execute on function public.worker_workload(text,integer) to authenticated;

alter table public.orders add column scanned_at timestamptz, add column scanned_by uuid references public.profiles(id), add column carrier_handover_at timestamptz;
create index orders_dispatch_queue_idx on public.orders(ship_by_date,id) where state <> 'cancelled' and not handed_over;
create table public.packing_batches (
  id uuid primary key default gen_random_uuid(), created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.packing_batch_orders (
  batch_id uuid not null references public.packing_batches(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  primary key(batch_id,order_id)
);
create index packing_batch_orders_order_idx on public.packing_batch_orders(order_id);
alter table public.packing_batches enable row level security;
alter table public.packing_batch_orders enable row level security;
grant select on public.packing_batches,public.packing_batch_orders to authenticated;
create policy batches_worker_read on public.packing_batches for select to authenticated using(private.current_user_role() is not null);
create policy batch_orders_worker_read on public.packing_batch_orders for select to authenticated using(private.current_user_role() is not null);

-- Shared eligibility is used by the queue and bulk commands; marketplace promises are never edited.
create function private.dispatch_eligible(o public.orders) returns boolean language sql immutable set search_path='' as $$
  select o.state <> 'cancelled' and upper(coalesce(o.marketplace_status,'')) not in ('CANCELLED','UNFULFILLABLE')
    and upper(coalesce(o.raw_payload #>> '{fulfillment,fulfilledBy}','MERCHANT')) <> 'AMAZON'
$$;

create function public.shipping_queue(p_filter text default 'today',p_page integer default 1,p_batch uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare today date := (now() at time zone 'Asia/Kolkata')::date; result jsonb;
begin
  if auth.uid() is null or private.current_user_role() is null then raise exception 'Unauthorized' using errcode='42501'; end if;
  if p_page is null or p_page<1 or p_filter is null or p_filter not in ('today','overdue','upcoming','unscanned','waiting','dispatched','cancelled','exceptions','all') then raise exception 'Invalid filter or page'; end if;
  with base as materialized (
    select o.* from public.orders o where
      (p_filter='cancelled' or private.dispatch_eligible(o)) and
      (p_batch is null or exists(select 1 from public.packing_batch_orders b where b.batch_id=p_batch and b.order_id=o.id))
  ), matching as materialized (
    select * from base o where case p_filter
      when 'today' then ship_by_date=today and not handed_over
      when 'overdue' then ship_by_date<today and not handed_over
      when 'upcoming' then ship_by_date>today and not handed_over
      when 'unscanned' then ship_by_date=today and not handed_over and scanned_at is null
      when 'waiting' then state='packed' and not handed_over
      when 'dispatched' then handed_over
      when 'cancelled' then state='cancelled' or upper(coalesce(marketplace_status,'')) in ('CANCELLED','UNFULFILLABLE')
      when 'exceptions' then not handed_over and (ship_by_date is null or nullif(btrim(awb),'') is null or not exists(select 1 from public.order_items i where i.order_id=o.id))
      else true end
  ), page as (
    select * from matching order by
      case when ship_by_date<today and state='pending' then 0 when ship_by_date=today and state='pending' then 1 else 2 end,
      ship_by_date nulls last,id limit 50 offset (p_page::bigint-1)*50
  ) select jsonb_build_object('date',today,'page',p_page,'pageSize',50,'total',(select count(*) from matching),
    'counts',(select jsonb_build_object('today',count(*) filter(where ship_by_date=today and not handed_over),
      'scanned',count(*) filter(where ship_by_date=today and not handed_over and scanned_at is not null),
      'unscanned',count(*) filter(where ship_by_date=today and not handed_over and scanned_at is null),
      'remaining',count(*) filter(where ship_by_date=today and not handed_over and state='pending'),
      'packed',count(*) filter(where ship_by_date=today and not handed_over and state='packed')) from base where private.dispatch_eligible(base)),
    'orders',coalesce((select jsonb_agg(private.order_json(id)||jsonb_build_object('shipByDate',ship_by_date,'handedOver',handed_over,
      'scannedAt',scanned_at,'carrierHandoverAt',carrier_handover_at,'marketplaceStatus',marketplace_status) order by
      case when ship_by_date<today and state='pending' then 0 when ship_by_date=today and state='pending' then 1 else 2 end,ship_by_date nulls last,id) from page),'[]'::jsonb)) into result;
  return result;
end $$;

create function public.record_order_scan(p_order_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or private.current_user_role() is null then raise exception 'Unauthorized' using errcode='42501'; end if;
  perform 1 from public.orders where id=p_order_id and private.dispatch_eligible(orders) and not handed_over for update;
  if not found then raise exception 'Order is cancelled, dispatched, or unavailable'; end if;
  update public.orders set scanned_at=now(),scanned_by=auth.uid() where id=p_order_id and scanned_at is null;
end $$;

create function public.start_packing_batch(p_all boolean default false,p_ids uuid[] default '{}',p_exclude uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare batch uuid; total bigint; today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if auth.uid() is null or private.current_user_role() is null then raise exception 'Unauthorized' using errcode='42501'; end if;
  insert into public.packing_batches(created_by) values(auth.uid()) returning id into batch;
  insert into public.packing_batch_orders(batch_id,order_id)
    select batch,id from public.orders o where private.dispatch_eligible(o) and not handed_over and state='pending'
      and nullif(btrim(awb),'') is not null and exists(select 1 from public.order_items i where i.order_id=o.id)
      and ((p_all and ship_by_date=today and not(id=any(p_exclude))) or (not p_all and id=any(p_ids))) for share;
  get diagnostics total = row_count;
  if total=0 then raise exception 'No eligible unpacked orders selected'; end if;
  return jsonb_build_object('id',batch,'total',total);
end $$;

create function public.confirm_carrier_handover(p_ids uuid[]) returns integer language plpgsql security definer set search_path='' as $$
declare total integer;
begin
  if auth.uid() is null or private.current_user_role() is null then raise exception 'Unauthorized' using errcode='42501'; end if;
  perform 1 from public.orders where id=any(p_ids) order by id for update;
  if exists(select 1 from public.orders o where id=any(p_ids) and (not private.dispatch_eligible(o) or state<>'packed')) then
    raise exception 'Only packed, non-cancelled orders can be handed to the carrier'; end if;
  update public.orders set carrier_handover_at=coalesce(carrier_handover_at,now()),handed_over=true where id=any(p_ids) and state='packed' and not handed_over;
  get diagnostics total = row_count; return total;
end $$;

-- Preserve physical handover across later Amazon refreshes.
create function private.retain_carrier_handover() returns trigger language plpgsql set search_path='' as $$
begin
  new.carrier_handover_at := coalesce(old.carrier_handover_at,new.carrier_handover_at);
  if new.carrier_handover_at is not null then new.handed_over := true; end if;
  return new;
end $$;
create trigger zz_retain_carrier_handover before update on public.orders for each row execute function private.retain_carrier_handover();

-- Exact order/AWB identification must not silently choose one of several separate orders.
create or replace function public.lookup_order(p_query text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare matches uuid[]; found_id uuid;
begin
  if auth.uid() is null or private.current_user_role() is null then raise exception 'Unauthorized' using errcode='42501'; end if;
  if p_query is null or char_length(btrim(p_query))<1 or char_length(p_query)>160 then raise exception 'Invalid query'; end if;
  select array_agg(id) into matches from public.orders where order_number=btrim(p_query) or marketplace_order_id=btrim(p_query) or awb=btrim(p_query);
  if cardinality(matches)>1 then raise exception 'Multiple orders share this identifier. Open the exact Amazon Order ID to verify each package.' using errcode='21000'; end if;
  found_id := matches[1];
  if found_id is null then
    select o.id into found_id from public.orders o where exists(select 1 from public.order_items oi left join public.product_barcodes pb on pb.product_id=oi.product_id
      where oi.order_id=o.id and (oi.sku_snapshot=btrim(p_query) or pb.barcode=btrim(p_query)))
      order by (o.state='pending') desc,o.purchased_at asc nulls last,o.created_at,id limit 1;
  end if;
  if found_id is null then return null; end if;
  return (select private.order_json(id)||jsonb_build_object('shipByDate',ship_by_date,'handedOver',handed_over,'scannedAt',scanned_at) from public.orders where id=found_id);
end $$;
create function private.prevent_dispatched_packing() returns trigger language plpgsql set search_path='' as $$
begin
  if exists(select 1 from public.orders where id=new.order_id and handed_over) then
    raise exception 'Dispatched orders cannot be newly marked packed';
  end if;
  return new;
end $$;
create trigger prevent_dispatched_packing before insert on public.packing_events for each row execute function private.prevent_dispatched_packing();
create function public.lookup_shipping_identifier(p_query text) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or private.current_user_role() is null then raise exception 'Unauthorized' using errcode='42501'; end if;
  if p_query is null or char_length(btrim(p_query))<1 or char_length(p_query)>160 then raise exception 'Invalid query'; end if;
  if not exists(select 1 from public.orders where awb=btrim(p_query) or marketplace_order_id=btrim(p_query) or order_number=btrim(p_query)) then return null; end if;
  return public.lookup_order(p_query);
end $$;
revoke all on function public.lookup_shipping_identifier(text) from public,anon;
grant execute on function public.lookup_shipping_identifier(text) to authenticated;
revoke all on function public.shipping_queue(text,integer,uuid),public.record_order_scan(uuid),public.start_packing_batch(boolean,uuid[],uuid[]),public.confirm_carrier_handover(uuid[]) from public,anon;
grant execute on function public.shipping_queue(text,integer,uuid),public.record_order_scan(uuid),public.start_packing_batch(boolean,uuid[],uuid[]),public.confirm_carrier_handover(uuid[]) to authenticated;

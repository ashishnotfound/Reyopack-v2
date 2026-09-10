alter table public.orders add column ship_by_date date, add column handed_over boolean not null default false;
create index if not exists orders_ship_by_state_idx on public.orders(ship_by_date, state);
create index if not exists orders_waiting_pickup_idx on public.orders(id) where state = 'packed' and not handed_over;
create index if not exists orders_pagination_idx on public.orders(created_at desc, id desc);
create extension if not exists pg_trgm with schema extensions;
create index if not exists products_title_trgm_idx on public.products using gin (title extensions.gin_trgm_ops);
create index if not exists packing_events_worker_name_trgm_idx on public.packing_events using gin (worker_display_name extensions.gin_trgm_ops);

create function private.set_order_operations() returns trigger language plpgsql set search_path = '' as $$
declare deadline text; packages jsonb;
begin
  deadline := coalesce(new.raw_payload #>> '{fulfillment,shipByWindow,latestDateTime}', new.raw_payload #>> '{fulfillment,shipByWindow,earliestDateTime}');
  begin
    new.ship_by_date := (deadline::timestamptz at time zone 'Asia/Kolkata')::date;
  exception when invalid_datetime_format or datetime_field_overflow then new.ship_by_date := null;
  end;
  packages := case when jsonb_typeof(new.raw_payload->'packages') = 'array' then new.raw_payload->'packages' else '[]'::jsonb end;
  new.handed_over := coalesce(new.marketplace_status in ('SHIPPED','DELIVERED'), false)
    or (jsonb_array_length(packages) > 0 and not exists (
      select 1 from jsonb_array_elements(packages) p where not (
        coalesce(p #>> '{packageStatus,status}', '') in ('SHIPPED','IN_TRANSIT','DELIVERED','UNDELIVERABLE')
        or coalesce(p #>> '{packageStatus,detailedStatus}', '') in ('PICKED_UP','DROPPED_OFF','AT_ORIGIN_FC','AT_DESTINATION_FC','DELIVERED','OUT_FOR_DELIVERY','RETURNING_TO_SELLER','RETURNED_TO_SELLER')
        or nullif(p->>'shipTime','') is not null)));
  return new;
end $$;
create trigger orders_operations before insert or update of raw_payload, marketplace_status on public.orders for each row execute function private.set_order_operations();
update public.orders set raw_payload = raw_payload;

create function public.order_overview() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if auth.uid() is null or not private.is_admin() then raise exception 'Unauthorized' using errcode='42501'; end if;
  select jsonb_build_object(
    'goingToday',count(*) filter(where ship_by_date=today),
    'leftToPack',count(*) filter(where ship_by_date=today and state <> 'packed'),
    'packedToday',count(*) filter(where ship_by_date=today and state='packed'),
    'waitingForPickup',count(*) filter(where state='packed' and not handed_over),
    'totalOrders',count(*) filter(where not handed_over),
    'overdue',count(*) filter(where ship_by_date<today and not handed_over),
    'missingDate',count(*) filter(where ship_by_date is null and not handed_over),
    'date',today
  ) into result from public.orders
  where state <> 'cancelled' and coalesce(marketplace_status,'') not in ('CANCELLED','UNFULFILLABLE')
    and coalesce(raw_payload #>> '{fulfillment,fulfilledBy}','MERCHANT') <> 'AMAZON';
  return result;
end $$;
revoke all on function public.order_overview() from public, anon;
grant execute on function public.order_overview() to authenticated;

create function public.orders_page(p_query text default '', p_page integer default 1, p_filter text default 'all')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if auth.uid() is null or not private.is_admin() then raise exception 'Unauthorized' using errcode='42501'; end if;
  if p_page < 1 then raise exception 'Invalid page'; end if;
  with matching as materialized (
    select o.id,o.created_at,o.ship_by_date,o.handed_over from public.orders o where
    (btrim(coalesce(p_query,''))='' or o.awb=btrim(p_query) or o.order_number=btrim(p_query) or o.marketplace_order_id=btrim(p_query)
      or exists(select 1 from public.order_items oi join public.products p on p.id=oi.product_id where oi.order_id=o.id and (oi.sku_snapshot=btrim(p_query) or p.asin=btrim(p_query) or p.title ilike '%'||btrim(p_query)||'%'))
      or exists(select 1 from public.packing_events pe where pe.order_id=o.id and pe.worker_display_name ilike '%'||btrim(p_query)||'%'))
    and (p_filter='all' or (
      o.state <> 'cancelled' and coalesce(o.marketplace_status,'') not in ('CANCELLED','UNFULFILLABLE')
      and coalesce(o.raw_payload #>> '{fulfillment,fulfilledBy}','MERCHANT') <> 'AMAZON'
      and case p_filter
        when 'today' then o.ship_by_date=today
        when 'left' then o.ship_by_date=today and o.state <> 'packed'
        when 'packed' then o.ship_by_date=today and o.state='packed'
        when 'waiting' then o.state='packed' and not o.handed_over
        when 'active' then not o.handed_over
        when 'overdue' then o.ship_by_date<today and not o.handed_over
        when 'missing' then o.ship_by_date is null and not o.handed_over
        else false end))
  ), page as (select * from matching order by created_at desc,id desc limit 50 offset ((p_page::bigint-1)*50))
  select jsonb_build_object('total',(select count(*) from matching),'orders',coalesce(
    (select jsonb_agg(private.order_json(id) || jsonb_build_object('shipByDate',ship_by_date,'handedOver',handed_over) order by created_at desc,id desc) from page),'[]'::jsonb)) into result;
  return result;
end $$;
revoke all on function public.orders_page(text,integer,text) from public,anon;
grant execute on function public.orders_page(text,integer,text) to authenticated;
drop function if exists public.admin_search_orders(text,integer);

alter table public.marketplaces add column sync_lease uuid, add column sync_lease_until timestamptz;
alter table public.sync_runs add column pagination_token text, add column pages_processed integer not null default 0;
create function public.claim_sync(p_marketplace uuid, p_lease uuid) returns boolean
language sql security definer set search_path = '' as $$
  with claimed as (update public.marketplaces set sync_lease=p_lease,sync_lease_until=now()+interval '5 minutes'
    where id=p_marketplace and (sync_lease_until is null or sync_lease_until<now()) returning id)
  select exists(select 1 from claimed)
$$;
revoke all on function public.claim_sync(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_sync(uuid,uuid) to service_role;

-- Preserve packed orders still awaiting collection under the existing retention policy.
create or replace function public.purge_expired_operational_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_id uuid;
  days_to_keep integer;
  deleted_orders integer := 0;
  deleted_files integer := 0;
  deleted_devices integer := 0;
begin
  if session_user <> 'postgres'
    and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
    and ((select auth.uid()) is null or private.is_admin() is false)
  then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  select greatest(value::integer, 7) into days_to_keep from public.system_settings where key = 'retention_days';
  days_to_keep := coalesce(days_to_keep, 7);
  insert into public.cleanup_runs(status) values ('running') returning id into run_id;
  begin
    insert into public.daily_aggregate_metrics(metric_date, worker_key, marketplace, sku, packed_orders, packed_units)
    select pe.packed_at::date, pe.worker_user_id::text, pe.marketplace, pe.sku, count(*), sum(pe.quantity)
    from public.packing_events pe join public.orders o on o.id = pe.order_id
    where o.state = 'packed' and o.handed_over and o.packed_at < now() - make_interval(days => days_to_keep)
    group by pe.packed_at::date, pe.worker_user_id, pe.marketplace, pe.sku
    on conflict (metric_date, worker_key, marketplace, sku) do update set packed_orders = public.daily_aggregate_metrics.packed_orders + excluded.packed_orders, packed_units = public.daily_aggregate_metrics.packed_units + excluded.packed_units, updated_at = now();
    with eligible as (
      select id from public.orders where (state = 'packed' and handed_over and packed_at < now() - make_interval(days => days_to_keep)) or (state = 'cancelled' and cancelled_at < now() - make_interval(days => days_to_keep))
    ), removed as (
      delete from storage.objects where bucket_id = 'temporary-labels' and split_part(name, '/', 1) in (select id::text from eligible) returning 1
    ) select count(*) into deleted_files from removed;
    delete from public.orders where (state = 'packed' and handed_over and packed_at < now() - make_interval(days => days_to_keep)) or (state = 'cancelled' and cancelled_at < now() - make_interval(days => days_to_keep));
    get diagnostics deleted_orders = row_count;
    delete from public.sync_runs where finished_at < now() - make_interval(days => days_to_keep);
    delete from public.devices where last_seen_at < now() - make_interval(days => days_to_keep);
    get diagnostics deleted_devices = row_count;
    update public.cleanup_runs set status = 'succeeded', records_deleted = deleted_orders, storage_objects_deleted = deleted_files, finished_at = now() where id = run_id;
    return jsonb_build_object('status', 'succeeded', 'deletedOrders', deleted_orders, 'deletedStorageObjects', deleted_files, 'deletedDevices', deleted_devices, 'retentionDays', days_to_keep);
  exception when others then
    update public.cleanup_runs set status = 'failed', error_message = left(sqlerrm, 500), finished_at = now() where id = run_id;
    return jsonb_build_object('status', 'failed', 'error', left(sqlerrm, 500), 'retentionDays', days_to_keep);
  end;
end;
$$;

create function private.preserve_order_progress() returns trigger language plpgsql set search_path='' as $$
begin
  if new.marketplace_updated_at is distinct from old.marketplace_updated_at
    and new.marketplace_updated_at < old.marketplace_updated_at then return old; end if;
  if old.state='packed' and new.state='pending' then new.state := 'packed'; end if;
  if old.state='cancelled' then new.state := 'cancelled'; end if;
  return new;
end $$;
create trigger orders_preserve_progress before update on public.orders for each row execute function private.preserve_order_progress();
revoke all on function private.set_order_operations() from public;
revoke all on function private.preserve_order_progress() from public;

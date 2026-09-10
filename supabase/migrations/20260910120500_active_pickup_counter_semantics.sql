-- Keep every "Going Today" derivative inside the active, not-yet-handed-over set.
create or replace function public.order_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'goingToday', count(*) filter (where ship_by_date = today and not handed_over),
    'leftToPack', count(*) filter (where ship_by_date = today and not handed_over and state <> 'packed'),
    'packedToday', count(*) filter (where ship_by_date = today and not handed_over and state = 'packed'),
    'waitingForPickup', count(*) filter (where state = 'packed' and not handed_over),
    'totalOrders', count(*) filter (where not handed_over),
    'overdue', count(*) filter (where ship_by_date < today and not handed_over),
    'missingDate', count(*) filter (where ship_by_date is null and not handed_over),
    'date', today
  ) into result
  from public.orders
  where state <> 'cancelled'
    and upper(coalesce(marketplace_status, '')) not in ('CANCELLED', 'UNFULFILLABLE')
    and upper(coalesce(raw_payload #>> '{fulfillment,fulfilledBy}', 'MERCHANT')) <> 'AMAZON';
  return result;
end;
$$;

create or replace function public.orders_page(
  p_query text default '',
  p_page integer default 1,
  p_filter text default 'all'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_page < 1 then raise exception 'Invalid page'; end if;

  with matching as materialized (
    select o.id, o.created_at, o.ship_by_date, o.handed_over
    from public.orders o
    where (
      btrim(coalesce(p_query, '')) = ''
      or o.awb = btrim(p_query)
      or o.order_number = btrim(p_query)
      or o.marketplace_order_id = btrim(p_query)
      or exists (
        select 1
        from public.order_items oi
        join public.products p on p.id = oi.product_id
        where oi.order_id = o.id
          and (oi.sku_snapshot = btrim(p_query) or p.asin = btrim(p_query) or p.title ilike '%' || btrim(p_query) || '%')
      )
      or exists (
        select 1 from public.packing_events pe
        where pe.order_id = o.id and pe.worker_display_name ilike '%' || btrim(p_query) || '%'
      )
    )
    and (
      p_filter = 'all'
      or (
        o.state <> 'cancelled'
        and upper(coalesce(o.marketplace_status, '')) not in ('CANCELLED', 'UNFULFILLABLE')
        and upper(coalesce(o.raw_payload #>> '{fulfillment,fulfilledBy}', 'MERCHANT')) <> 'AMAZON'
        and case p_filter
          when 'today' then o.ship_by_date = today and not o.handed_over
          when 'left' then o.ship_by_date = today and not o.handed_over and o.state <> 'packed'
          when 'packed' then o.ship_by_date = today and not o.handed_over and o.state = 'packed'
          when 'waiting' then o.state = 'packed' and not o.handed_over
          when 'active' then not o.handed_over
          when 'overdue' then o.ship_by_date < today and not o.handed_over
          when 'missing' then o.ship_by_date is null and not o.handed_over
          else false
        end
      )
    )
  ), page as (
    select * from matching
    order by created_at desc, id desc
    limit 50 offset ((p_page::bigint - 1) * 50)
  )
  select jsonb_build_object(
    'total', (select count(*) from matching),
    'orders', coalesce((
      select jsonb_agg(
        private.order_json(id) || jsonb_build_object('shipByDate', ship_by_date, 'handedOver', handed_over)
        order by created_at desc, id desc
      ) from page
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.order_overview() from public, anon;
grant execute on function public.order_overview() to authenticated;
revoke all on function public.orders_page(text, integer, text) from public, anon;
grant execute on function public.orders_page(text, integer, text) to authenticated;

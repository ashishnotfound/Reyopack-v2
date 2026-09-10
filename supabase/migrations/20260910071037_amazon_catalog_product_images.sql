alter table public.products
  add column image_url text,
  add column image_synced_at timestamptz,
  add constraint products_image_url_https check (image_url is null or image_url ~ '^https://');

create or replace function private.order_json(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id,
    'orderNumber', o.order_number,
    'marketplaceOrderId', o.marketplace_order_id,
    'awb', o.awb,
    'marketplace', m.name,
    'state', o.state,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', oi.id,
        'productId', p.id,
        'title', oi.title_snapshot,
        'sku', oi.sku_snapshot,
        'asin', p.asin,
        'variation', oi.variation,
        'quantity', oi.quantity,
        'imageUrl', coalesce(pi.storage_path, p.image_url),
        'location', concat_ws(' · ', nullif('Rack ' || l.rack, 'Rack '), nullif('Shelf ' || l.shelf, 'Shelf '), nullif('Bin ' || l.bin, 'Bin '))
      ) order by oi.created_at)
      from public.order_items oi
      join public.products p on p.id = oi.product_id
      left join public.locations l on l.id = p.location_id
      left join lateral (select storage_path from public.product_images where product_id = p.id order by is_primary desc, created_at limit 1) pi on true
      where oi.order_id = o.id
    ), '[]'::jsonb),
    'packing', case when pe.id is null then null else jsonb_build_object(
      'id', pe.id,
      'workerId', pe.worker_user_id,
      'workerDisplayName', pe.worker_display_name,
      'packedAt', pe.packed_at
    ) end
  )
  from public.orders o
  join public.marketplaces m on m.id = o.marketplace_id
  left join public.packing_events pe on pe.order_id = o.id
  where o.id = p_order_id
$$;

revoke all on function private.order_json(uuid) from public;

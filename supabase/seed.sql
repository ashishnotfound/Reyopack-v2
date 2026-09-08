-- Local sample catalog and orders. Create an Auth user with `npm run admin:create`
-- before using the authenticated UI against the local stack.

insert into public.locations(id, warehouse_id, code, rack, shelf, bin)
select '50000000-0000-4000-8000-000000000001', id, 'A-03-12', 'A', '03', '12'
from public.warehouses where name = 'Reyo Store — Main'
on conflict (id) do nothing;

insert into public.products(id, sku, title, asin, location_id)
values
  ('30000000-0000-4000-8000-000000000001', 'FRIEREN-A4-01', 'Frieren A4 Art Print', 'B0REY0PACK1', '50000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002', 'BMW-M3-A4-02', 'BMW M3 A4 Poster', 'B0REY0PACK2', null)
on conflict (id) do nothing;

insert into public.product_barcodes(product_id, barcode)
values ('30000000-0000-4000-8000-000000000001', '8900000000001')
on conflict (barcode) do nothing;

insert into public.orders(id, order_number, marketplace_id, marketplace_order_id, awb, state, marketplace_status, purchased_at)
select '10000000-0000-4000-8000-000000000001', 'RP-0907-001', id, '408-1234567-1234567', 'AWB-REYO-24090701', 'pending', 'UNSHIPPED', now()
from public.marketplaces where key = 'amazon'
on conflict (id) do nothing;

insert into public.order_items(id, order_id, product_id, marketplace_item_id, title_snapshot, sku_snapshot, variation, quantity)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'AMZ-ITEM-001', 'Frieren A4 Art Print', 'FRIEREN-A4-01', 'A4 · Matte', 1)
on conflict (id) do nothing;

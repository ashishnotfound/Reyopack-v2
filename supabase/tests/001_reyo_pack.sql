begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- Self-contained fixtures. These changes are rolled back with the test.
delete from auth.users where id = '00000000-0000-4000-8000-000000000001';
delete from public.packing_events where order_id = '10000000-0000-4000-8000-000000000001';
delete from public.order_items where order_id = '10000000-0000-4000-8000-000000000001';
delete from public.orders where id = '10000000-0000-4000-8000-000000000001';
delete from public.product_barcodes where barcode = '8900000000001';
delete from public.products where id = '30000000-0000-4000-8000-000000000001';
delete from public.locations where id = '50000000-0000-4000-8000-000000000001';

insert into public.locations(id, warehouse_id, code, rack, shelf, bin)
select '50000000-0000-4000-8000-000000000001', id, 'TEST-A-03-12', 'A', '03', '12'
from public.warehouses
where name = 'Reyo Store — Main';

insert into public.products(id, sku, title, asin, location_id)
values ('30000000-0000-4000-8000-000000000001', 'FRIEREN-A4-01', 'Frieren A4 Art Print', 'B0REY0PACK1', '50000000-0000-4000-8000-000000000001');

insert into public.product_barcodes(product_id, barcode)
values ('30000000-0000-4000-8000-000000000001', '8900000000001');

insert into public.orders(id, order_number, marketplace_id, marketplace_order_id, awb, state, marketplace_status, purchased_at)
select '10000000-0000-4000-8000-000000000001', 'RP-TEST-001', id, '408-1234567-1234567', 'AWB-REYO-TEST-001', 'pending', 'UNSHIPPED', now()
from public.marketplaces
where key = 'amazon';

insert into public.order_items(id, order_id, product_id, marketplace_item_id, title_snapshot, sku_snapshot, variation, quantity)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'AMZ-TEST-ITEM-001', 'Frieren A4 Art Print', 'FRIEREN-A4-01', 'A4 · Matte', 1);

select has_table('public', 'orders', 'orders table exists');
select has_table('public', 'packing_events', 'packing events table exists');
select has_table('public', 'products', 'products table exists');
select has_table('public', 'daily_aggregate_metrics', 'aggregate metrics table exists');
select has_function('public', 'lookup_order', array['text'], 'lookup RPC exists');
select has_function('public', 'pack_order', array['uuid','text','text'], 'atomic pack RPC exists');
select has_function('public', 'purge_expired_operational_data', array[]::text[], 'retention RPC exists');
select has_function('public', 'get_marketplace_credentials', array['text'], 'credential read RPC exists');
select has_function('public', 'set_marketplace_credentials', array['text','jsonb'], 'credential write RPC exists');
select is(has_function_privilege('authenticated', 'public.get_marketplace_credentials(text)', 'EXECUTE'), false, 'authenticated users cannot read decrypted credentials');
select is(has_function_privilege('service_role', 'public.get_marketplace_credentials(text)', 'EXECUTE'), true, 'server service role can load credentials');
select is(has_function_privilege('authenticated', 'public.set_marketplace_credentials(text,jsonb)', 'EXECUTE'), false, 'authenticated users cannot write credentials directly');
select is(has_function_privilege('service_role', 'public.set_marketplace_credentials(text,jsonb)', 'EXECUTE'), true, 'server service role can save credentials');
select is(has_table_privilege('authenticated', 'public.marketplace_integrations', 'SELECT'), false, 'integration records are not exposed to authenticated browser clients');
select has_index('public', 'orders', 'orders_awb_unique_idx', 'AWB has an index');
select has_index('public', 'orders', 'orders_marketplace_order_id_idx', 'marketplace order ID has an index');
select has_index('public', 'packing_events', 'packing_events_worker_idx', 'worker activity has an index');
select col_is_unique('public', 'packing_events', 'order_id', 'an order can have only one packing event');
select policies_are(
  'public',
  'orders',
  array['orders_active_read','orders_admin_delete','orders_admin_insert','orders_admin_update'],
  'orders has explicit read and admin policies'
);

insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'worker@reyo.test', extensions.crypt('StrongPassword123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"],"role":"worker"}', '{"display_name":"Reyo"}', now(), now())
on conflict (id) do nothing;

select is((select role::text from public.user_roles where user_id = '00000000-0000-4000-8000-000000000001'), 'worker', 'new users receive a worker role from app metadata');
select is((select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000001'), 'Reyo', 'profile display name is created server-side');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(public.lookup_order('408-1234567-1234567')->>'marketplaceOrderId', '408-1234567-1234567', 'worker can repeatedly look up an order');
select is(public.lookup_order('408-1234567-1234567')->>'marketplaceOrderId', '408-1234567-1234567', 'second lookup is also allowed');
select is(public.lookup_order('FRIEREN-A4-01')->>'marketplaceOrderId', '408-1234567-1234567', 'worker can look up an order by SKU');
select is(public.lookup_order('8900000000001')->>'marketplaceOrderId', '408-1234567-1234567', 'worker can look up an order by product barcode');
select is(public.pack_order('10000000-0000-4000-8000-000000000001', 'test-device', 'pgTAP')->>'alreadyPacked', 'false', 'first pack call succeeds');
select is(public.pack_order('10000000-0000-4000-8000-000000000001', 'test-device', 'pgTAP')->>'alreadyPacked', 'true', 'second pack call is idempotent');
select is((select count(*)::integer from public.packing_events where order_id = '10000000-0000-4000-8000-000000000001'), 1, 'duplicate packing event is impossible');

set local role postgres;
insert into public.orders(id, order_number, marketplace_id, marketplace_order_id, state, marketplace_status, created_at)
select '10000000-0000-4000-8000-000000000090', 'RP-OLD-ACTIVE', id, 'ACTIVE-OLD-ORDER', 'pending', 'UNSHIPPED', now() - interval '30 days' from public.marketplaces where key = 'amazon'
on conflict (id) do nothing;
select lives_ok($$ select public.purge_expired_operational_data() $$, 'retention cleanup runs successfully');
select is((select count(*)::integer from public.orders where id = '10000000-0000-4000-8000-000000000090'), 1, 'old active orders are preserved');
select is((select count(*)::integer from public.products where id = '30000000-0000-4000-8000-000000000001'), 1, 'permanent products are preserved');

select * from finish();
rollback;

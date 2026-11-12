begin;
create extension if not exists pgtap with schema extensions;
select plan(21);
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-4000-8000-000000000098','00000000-0000-0000-0000-000000000000','authenticated','authenticated','shipping-test@reyo.test','',now(),'{"provider":"email","providers":["email"],"role":"worker"}','{"display_name":"Shipping test"}',now(),now());
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000098',true);
select set_config('request.jwt.claim.role','authenticated',true);
create temporary table baseline as select public.shipping_queue() as value;
insert into public.products(id,sku,title) values('30000000-0000-4000-8000-000000000098','SHIPPING-SYNTHETIC','Synthetic shipping product');
insert into public.orders(order_number,marketplace_id,marketplace_order_id,awb,raw_payload)
select 'SHIP-TEST-'||n,m.id,'SHIP-TEST-'||n,'SHIPPING-AWB-'||n,
  jsonb_build_object('fulfillment',jsonb_build_object('shipByWindow',jsonb_build_object('latestDateTime',((now() at time zone 'Asia/Kolkata')::date::text||'T00:00:00+05:30'))))
from generate_series(1,55) n cross join public.marketplaces m where m.key='amazon';
insert into public.order_items(order_id,product_id,marketplace_item_id,title_snapshot,sku_snapshot,quantity)
select id,'30000000-0000-4000-8000-000000000098',order_number,'Synthetic shipping product','SHIPPING-SYNTHETIC',2 from public.orders where order_number like 'SHIP-TEST-%';
grant select on baseline to authenticated;
set local role authenticated;
select is((public.shipping_queue()->'counts'->>'today')::int,(select(value->'counts'->>'today')::int+55 from baseline),'all 55 orders counted at India midnight');
select is(jsonb_array_length(public.shipping_queue('today',1)->'orders'),50,'shipping first page bounded');
select ok(jsonb_array_length(public.shipping_queue('today',2)->'orders')>=5,'all remaining orders reachable');
select lives_ok($$select public.record_order_scan((select id from public.orders where order_number='SHIP-TEST-1'))$$,'scan recorded');
select lives_ok($$select public.record_order_scan((select id from public.orders where order_number='SHIP-TEST-1'))$$,'repeat scan idempotent');
select is((select state::text from public.orders where order_number='SHIP-TEST-1'),'pending','scan never marks packed');
select is((public.shipping_queue()->'counts'->>'scanned')::int,(select(value->'counts'->>'scanned')::int+1 from baseline),'scanned counter increments once');
select throws_ok($$select public.confirm_carrier_handover(array[(select id from public.orders where order_number='SHIP-TEST-1')])$$,'P0001','Only packed, non-cancelled orders can be handed to the carrier','unpacked handover rejected');
select is(public.pack_order((select id from public.orders where order_number='SHIP-TEST-1'),'shipping-test','test')->>'alreadyPacked','false','pack persists');
select is(public.confirm_carrier_handover(array[(select id from public.orders where order_number='SHIP-TEST-1')]),1,'physical handover recorded');
select is(public.confirm_carrier_handover(array[(select id from public.orders where order_number='SHIP-TEST-1')]),0,'repeat handover idempotent');
select is((select marketplace_status from public.orders where order_number='SHIP-TEST-1'),null::text,'physical handover does not claim Amazon shipped');
select ok((public.start_packing_batch(true)->>'total')::int>=54,'select-all batch covers every page');
select is((public.start_packing_batch(false,array[(select id from public.orders where order_number='SHIP-TEST-2')])->>'total')::int,1,'subset batch exact');
set local role postgres;
update public.orders set awb='SHARED-AWB-TEST' where order_number in ('SHIP-TEST-3','SHIP-TEST-4');
update public.orders set handed_over=false where order_number='SHIP-TEST-1';
set local role authenticated;
select ok((select handed_over from public.orders where order_number='SHIP-TEST-1'),'later refresh preserves physical handover');
select throws_ok($$select public.lookup_order('SHARED-AWB-TEST')$$,'21000','Multiple orders share this identifier. Open the exact Amazon Order ID to verify each package.','ambiguous AWB cannot silently select a package');
select is(public.lookup_order('SHIP-TEST-3')->>'marketplaceOrderId','SHIP-TEST-3','exact order ID resolves ambiguity');
select is(public.lookup_shipping_identifier('SHIPPING-SYNTHETIC'),null::jsonb,'camera cannot mistake a product SKU for a shipping identifier');
set local role postgres;
update public.orders set marketplace_status='SHIPPED' where order_number='SHIP-TEST-2';
set local role authenticated;
select is(public.lookup_order('SHIP-TEST-2')->>'handedOver','true','lookup preserves operational handover metadata');
select throws_ok($$select public.pack_order((select id from public.orders where order_number='SHIP-TEST-2'),'test','test')$$,'P0001','Dispatched orders cannot be newly marked packed','already dispatched orders cannot be newly packed');
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select public.shipping_queue()$$,'42501','Unauthorized','missing identity rejected');
select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);
insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000077','00000000-0000-0000-0000-000000000000','authenticated','authenticated','workload@reyo.test','',now(),'{"provider":"email","providers":["email"],"role":"worker"}','{"display_name":"Workload worker"}',now(),now());
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000077',true);
select set_config('request.jwt.claim.role','authenticated',true);
create temporary table baseline as select public.worker_workload() as value;
insert into public.orders(order_number,marketplace_id,marketplace_order_id,raw_payload)
select 'WORKLOAD-TEST-'||n,m.id,'WORKLOAD-TEST-'||n,jsonb_build_object('fulfillment',jsonb_build_object('shipByWindow',jsonb_build_object('latestDateTime',((now() at time zone 'Asia/Kolkata')::date::text||'T12:00:00+05:30'))))
from generate_series(1,55) n cross join public.marketplaces m where m.key='amazon';
grant select on baseline to authenticated;
set local role authenticated;
select is((public.worker_workload()->'counts'->>'today')::int,(select (value->'counts'->>'today')::int+55 from baseline),'worker counts include every inserted order');
select is((public.worker_workload()->'counts'->>'totalOrders')::int,(select (value->'counts'->>'totalOrders')::int+55 from baseline),'worker total uses the complete active dataset');
select is(jsonb_array_length(public.worker_workload('today',1)->'orders'),50,'first page is bounded');
select ok(jsonb_array_length(public.worker_workload('today',2)->'orders')>=5,'remaining orders are accessible on page two');
select throws_ok($$select public.order_overview()$$,'42501','Unauthorized','worker cannot access admin overview RPC');
select throws_ok($$select public.orders_page()$$,'42501','Unauthorized','worker cannot access admin order RPC');
select throws_ok($$select public.worker_workload('invalid',1)$$,'P0001','Invalid workload filter or page','invalid filters rejected');
set local role postgres;
update public.profiles set active=false where id='00000000-0000-4000-8000-000000000077';
set local role authenticated;
select throws_ok($$select public.worker_workload()$$,'42501','Unauthorized','inactive worker cannot read workload');
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select public.worker_workload()$$,'42501','Unauthorized','missing identity cannot read workload');
select * from finish();
rollback;

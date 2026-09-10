begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select has_column('public','sync_runs','sync_version','sync runs are versioned');
select has_column('public','sync_runs','window_start','sync window start is persisted');
select has_column('public','sync_runs','window_end','sync window end is persisted');
select has_column('public','sync_runs','records_fetched','fetched orders are counted');
select has_column('public','sync_runs','records_added','new orders are counted');
select has_column('public','sync_runs','records_updated','updated orders are counted');
select has_column('public','sync_runs','records_failed','failed orders are counted');
select has_table('public','sync_failures','per-request and per-order failures are logged');
select has_column('public','sync_failures','resolved_at','repaired failures retain resolution history');
select has_index('public','sync_failures','sync_failures_unresolved_idx','unresolved sync failures are indexed');
select ok((select relrowsecurity from pg_class where oid='public.sync_failures'::regclass),'sync failure logs use RLS');
select is((select i.indisunique from pg_index i where i.indexrelid='public.orders_awb_unique_idx'::regclass),false,'AWB index does not merge legitimate separate orders');

insert into public.orders(id,order_number,marketplace_id,marketplace_order_id,state,marketplace_status,cancelled_at,marketplace_updated_at,raw_payload)
select '00000000-0000-4000-8000-000000000088','SYNC-CANCELLED-TEST',id,'SYNC-CANCELLED-TEST','cancelled','CANCELLED',now(),now(),'{}'::jsonb
from public.marketplaces where key='amazon';
update public.orders set state='pending',marketplace_status='PENDING',cancelled_at=null,marketplace_updated_at=marketplace_updated_at+interval '1 minute'
where id='00000000-0000-4000-8000-000000000088';
select is((select state::text from public.orders where id='00000000-0000-4000-8000-000000000088'),'cancelled','a cancelled order is never reopened by later Amazon data');
select isnt((select cancelled_at from public.orders where id='00000000-0000-4000-8000-000000000088'),null::timestamptz,'preserved cancellation retains its required timestamp');

insert into public.orders(id,order_number,marketplace_id,marketplace_order_id,state,marketplace_status,packed_at,marketplace_updated_at,raw_payload)
select '00000000-0000-4000-8000-000000000089','SYNC-PACKED-TEST',id,'SYNC-PACKED-TEST','packed','UNSHIPPED',now(),now(),'{}'::jsonb
from public.marketplaces where key='amazon';
update public.orders set state='packed',marketplace_status='SHIPPED',packed_at=null,marketplace_updated_at=marketplace_updated_at+interval '1 minute'
where id='00000000-0000-4000-8000-000000000089';
select is((select state::text from public.orders where id='00000000-0000-4000-8000-000000000089'),'packed','Amazon refresh preserves a worker-packed order');
select isnt((select packed_at from public.orders where id='00000000-0000-4000-8000-000000000089'),null::timestamptz,'preserved packed order retains its required timestamp');

select * from finish();
rollback;

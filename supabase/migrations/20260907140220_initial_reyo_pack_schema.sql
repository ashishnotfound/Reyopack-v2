-- Reyo Pack production schema: Auth, RLS, Storage, Realtime, atomic packing,
-- marketplace sync, CSV import, and terminal-state retention.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pg_cron;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.app_role as enum ('super_admin', 'admin', 'worker');
create type public.order_state as enum ('pending', 'packed', 'cancelled');
create type public.run_status as enum ('running', 'succeeded', 'failed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null check (char_length(display_name) between 2 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role public.app_role not null default 'worker',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  code text not null,
  rack text,
  shelf text,
  bin text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (warehouse_id, code)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  title text not null,
  asin text,
  fsn text,
  default_quantity integer not null default 1 check (default_quantity > 0),
  location_id uuid references public.locations(id) on delete set null,
  active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null unique,
  alt_text text,
  width integer,
  height integer,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index product_images_one_primary_idx on public.product_images(product_id) where is_primary;

create table public.product_barcodes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  barcode text not null unique,
  created_at timestamptz not null default now()
);

create table public.marketplaces (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.marketplace_products (
  id uuid primary key default gen_random_uuid(),
  marketplace_id uuid not null references public.marketplaces(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  marketplace_sku text not null,
  asin text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (marketplace_id, marketplace_sku)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  marketplace_id uuid not null references public.marketplaces(id) on delete restrict,
  marketplace_order_id text not null,
  awb text,
  state public.order_state not null default 'pending',
  marketplace_status text,
  purchased_at timestamptz,
  marketplace_updated_at timestamptz,
  packed_at timestamptz,
  cancelled_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (marketplace_id, marketplace_order_id),
  check ((state = 'packed' and packed_at is not null) or state <> 'packed'),
  check ((state = 'cancelled' and cancelled_at is not null) or state <> 'cancelled')
);

create unique index orders_awb_unique_idx on public.orders(awb) where awb is not null and awb <> '';
create index orders_marketplace_order_id_idx on public.orders(marketplace_order_id);
create index orders_order_number_idx on public.orders(order_number);
create index orders_state_idx on public.orders(state);
create index orders_packed_at_idx on public.orders(packed_at) where packed_at is not null;
create index orders_cancelled_at_idx on public.orders(cancelled_at) where cancelled_at is not null;
create index orders_marketplace_updated_at_idx on public.orders(marketplace_updated_at);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  marketplace_item_id text not null,
  title_snapshot text not null,
  sku_snapshot text not null,
  variation text,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (order_id, marketplace_item_id)
);

create index order_items_order_id_idx on public.order_items(order_id);
create index order_items_sku_idx on public.order_items(sku_snapshot);
create index products_asin_idx on public.products(asin) where asin is not null;
create index products_title_trgm_idx on public.products using gin (title extensions.gin_trgm_ops);
create index products_sku_idx on public.products(sku);
create index product_barcodes_barcode_idx on public.product_barcodes(barcode);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  device_key text not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  user_agent text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.packing_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  internal_order_number text not null,
  marketplace_order_id text not null,
  awb text,
  worker_user_id uuid not null references public.profiles(id) on delete restrict,
  worker_display_name text not null,
  product_id uuid not null references public.products(id) on delete restrict,
  product_title text not null,
  sku text not null,
  quantity integer not null check (quantity > 0),
  marketplace text not null,
  packed_at timestamptz not null default now(),
  device_id text,
  user_agent text,
  unique (order_id)
);

create index packing_events_packed_at_idx on public.packing_events(packed_at desc);
create index packing_events_worker_idx on public.packing_events(worker_user_id, packed_at desc);
create index packing_events_marketplace_order_idx on public.packing_events(marketplace_order_id);
create index packing_events_sku_idx on public.packing_events(sku);

create table public.marketplace_integrations (
  id uuid primary key default gen_random_uuid(),
  marketplace_id uuid not null references public.marketplaces(id) on delete cascade,
  encrypted_credentials text not null,
  key_version integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (marketplace_id)
);

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  marketplace_id uuid not null references public.marketplaces(id) on delete cascade,
  status public.run_status not null,
  checkpoint text,
  records_processed integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index sync_runs_marketplace_started_idx on public.sync_runs(marketplace_id, started_at desc);

create table public.system_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table public.cleanup_runs (
  id uuid primary key default gen_random_uuid(),
  status public.run_status not null,
  records_deleted integer not null default 0,
  storage_objects_deleted integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.daily_aggregate_metrics (
  id uuid primary key default gen_random_uuid(),
  metric_date date not null,
  worker_key text not null default '',
  marketplace text not null default '',
  sku text not null default '',
  packed_orders integer not null default 0,
  packed_units integer not null default 0,
  packing_seconds bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (metric_date, worker_key, marketplace, sku)
);

insert into public.system_settings(key, value) values ('retention_days', '7') on conflict (key) do nothing;
insert into public.warehouses(name) values ('Reyo Store — Main') on conflict (name) do nothing;
insert into public.marketplaces(key, name) values ('amazon', 'Amazon SP-API'), ('flipkart', 'Flipkart'), ('csv', 'CSV Import') on conflict (key) do update set name = excluded.name;

create or replace function private.set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','user_roles','warehouses','locations','products','marketplaces','marketplace_products','orders','marketplace_integrations','system_settings','daily_aggregate_metrics']
  loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', table_name);
  end loop;
end $$;

create or replace function private.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select ur.role from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  where ur.user_id = (select auth.uid()) and p.active = true
$$;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_user_role() in ('admin','super_admin'), false)
$$;

create or replace function private.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_user_role() = 'super_admin', false)
$$;

revoke all on function private.current_user_role() from public;
revoke all on function private.is_admin() from public;
revoke all on function private.is_super_admin() from public;
grant usage on schema private to authenticated;
grant execute on function private.current_user_role() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_super_admin() to authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare requested_role public.app_role;
begin
  requested_role := coalesce((new.raw_app_meta_data ->> 'role')::public.app_role, 'worker');
  insert into public.profiles(id, email, display_name, active)
  values (new.id, coalesce(new.email, ''), coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, 'Worker'), '@', 1)), true);
  insert into public.user_roles(user_id, role) values (new.id, requested_role);
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

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
        'imageUrl', pi.storage_path,
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

create or replace function public.lookup_order(p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare found_id uuid;
begin
  if (select auth.uid()) is null or private.current_user_role() is null then raise exception 'Unauthorized' using errcode = '42501'; end if;
  if p_query is null or char_length(btrim(p_query)) < 1 or char_length(p_query) > 160 then raise exception 'Invalid query' using errcode = '22023'; end if;
  select o.id into found_id
  from public.orders o
  where o.order_number = btrim(p_query)
     or o.marketplace_order_id = btrim(p_query)
     or o.awb = btrim(p_query)
     or exists (
       select 1
       from public.order_items oi
       left join public.product_barcodes pb on pb.product_id = oi.product_id
       where oi.order_id = o.id
         and (oi.sku_snapshot = btrim(p_query) or pb.barcode = btrim(p_query))
     )
  order by (o.state = 'pending') desc, o.purchased_at asc nulls last, o.created_at asc
  limit 1;
  if found_id is null then return null; end if;
  return private.order_json(found_id);
end;
$$;

create or replace function public.get_order_detail(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.is_admin() is false then raise exception 'Unauthorized' using errcode = '42501'; end if;
  return private.order_json(p_order_id);
end;
$$;

create or replace function public.pack_order(p_order_id uuid, p_device_id text, p_user_agent text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  worker_id uuid := (select auth.uid());
  worker_name text;
  order_row public.orders%rowtype;
  existing_event_id uuid;
  first_item record;
  total_quantity integer;
  marketplace_name text;
begin
  if worker_id is null or private.current_user_role() is null then raise exception 'Unauthorized' using errcode = '42501'; end if;
  select display_name into worker_name from public.profiles where id = worker_id and active = true;
  if worker_name is null then raise exception 'Inactive account' using errcode = '42501'; end if;
  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if order_row.state = 'cancelled' then raise exception 'Cancelled orders cannot be packed' using errcode = '23514'; end if;
  select id into existing_event_id from public.packing_events where order_id = p_order_id;
  if existing_event_id is not null then return jsonb_build_object('order', private.order_json(p_order_id), 'alreadyPacked', true); end if;
  select oi.product_id, oi.title_snapshot, oi.sku_snapshot into first_item from public.order_items oi where oi.order_id = p_order_id order by oi.created_at limit 1;
  select coalesce(sum(quantity), 0) into total_quantity from public.order_items where order_id = p_order_id;
  if first_item.product_id is null then raise exception 'Order has no packable items' using errcode = '23514'; end if;
  select name into marketplace_name from public.marketplaces where id = order_row.marketplace_id;
  update public.orders set state = 'packed', packed_at = now() where id = p_order_id;
  insert into public.packing_events(order_id, internal_order_number, marketplace_order_id, awb, worker_user_id, worker_display_name, product_id, product_title, sku, quantity, marketplace, device_id, user_agent)
  values (p_order_id, order_row.order_number, order_row.marketplace_order_id, order_row.awb, worker_id, worker_name, first_item.product_id, first_item.title_snapshot, first_item.sku_snapshot, total_quantity, marketplace_name, left(p_device_id, 160), left(p_user_agent, 500));
  insert into public.devices(device_key, user_id, user_agent, last_seen_at) values (left(p_device_id, 160), worker_id, left(p_user_agent, 500), now())
  on conflict (device_key) do update set user_id = excluded.user_id, user_agent = excluded.user_agent, last_seen_at = now();
  return jsonb_build_object('order', private.order_json(p_order_id), 'alreadyPacked', false);
exception when unique_violation then
  return jsonb_build_object('order', private.order_json(p_order_id), 'alreadyPacked', true);
end;
$$;

create or replace function public.admin_search_orders(p_query text default null, p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if (select auth.uid()) is null or private.is_admin() is false then raise exception 'Unauthorized' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(private.order_json(q.id) order by q.created_at desc), '[]'::jsonb) into result
  from (
    select distinct o.id, o.created_at from public.orders o
    where p_query is null or btrim(p_query) = ''
      or o.order_number = btrim(p_query)
      or o.marketplace_order_id = btrim(p_query)
      or o.awb = btrim(p_query)
      or exists (select 1 from public.order_items oi join public.products p on p.id = oi.product_id where oi.order_id = o.id and (oi.sku_snapshot = btrim(p_query) or p.asin = btrim(p_query) or p.title ilike '%' || btrim(p_query) || '%'))
      or exists (select 1 from public.packing_events pe where pe.order_id = o.id and pe.worker_display_name ilike '%' || btrim(p_query) || '%')
    order by o.created_at desc limit least(greatest(p_limit, 1), 200)
  ) q;
  return result;
end;
$$;

create or replace function public.import_orders(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  marketplace_row_id uuid;
  product_row_id uuid;
  order_row_id uuid;
  imported integer := 0;
  duplicates integer := 0;
  existed boolean;
begin
  if (select auth.uid()) is null or private.is_admin() is false then raise exception 'Unauthorized' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 5000 then raise exception 'Invalid import size' using errcode = '22023'; end if;
  for row_data in select * from jsonb_array_elements(p_rows)
  loop
    if coalesce(row_data->>'marketplace_order_id','') = '' or coalesce(row_data->>'sku','') = '' or coalesce((row_data->>'quantity')::integer,0) < 1 then raise exception 'Invalid import row' using errcode = '22023'; end if;
    insert into public.marketplaces(key, name) values (lower(regexp_replace(row_data->>'marketplace','[^a-zA-Z0-9]+','-','g')), row_data->>'marketplace') on conflict (key) do update set name = excluded.name returning id into marketplace_row_id;
    insert into public.products(sku, title, asin) values (row_data->>'sku', row_data->>'product_title', nullif(row_data->>'asin','')) on conflict (sku) do update set title = excluded.title, asin = coalesce(excluded.asin, public.products.asin) returning id into product_row_id;
    select exists(select 1 from public.orders where marketplace_id = marketplace_row_id and marketplace_order_id = row_data->>'marketplace_order_id') into existed;
    insert into public.orders(order_number, marketplace_id, marketplace_order_id, awb, state, marketplace_status) values (row_data->>'order_id', marketplace_row_id, row_data->>'marketplace_order_id', nullif(row_data->>'awb',''), 'pending', 'IMPORTED')
    on conflict (marketplace_id, marketplace_order_id) do update set awb = coalesce(excluded.awb, public.orders.awb), updated_at = now() returning id into order_row_id;
    insert into public.order_items(order_id, product_id, marketplace_item_id, title_snapshot, sku_snapshot, variation, quantity) values (order_row_id, product_row_id, row_data->>'sku', row_data->>'product_title', row_data->>'sku', nullif(row_data->>'variation',''), (row_data->>'quantity')::integer)
    on conflict (order_id, marketplace_item_id) do update set product_id = excluded.product_id, title_snapshot = excluded.title_snapshot, sku_snapshot = excluded.sku_snapshot, variation = excluded.variation, quantity = excluded.quantity;
    if existed then duplicates := duplicates + 1; else imported := imported + 1; end if;
  end loop;
  return jsonb_build_object('imported', imported, 'duplicates', duplicates);
end;
$$;

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
    where o.state = 'packed' and o.packed_at < now() - make_interval(days => days_to_keep)
    group by pe.packed_at::date, pe.worker_user_id, pe.marketplace, pe.sku
    on conflict (metric_date, worker_key, marketplace, sku) do update set packed_orders = public.daily_aggregate_metrics.packed_orders + excluded.packed_orders, packed_units = public.daily_aggregate_metrics.packed_units + excluded.packed_units, updated_at = now();
    with eligible as (
      select id from public.orders where (state = 'packed' and packed_at < now() - make_interval(days => days_to_keep)) or (state = 'cancelled' and cancelled_at < now() - make_interval(days => days_to_keep))
    ), removed as (
      delete from storage.objects where bucket_id = 'temporary-labels' and split_part(name, '/', 1) in (select id::text from eligible) returning 1
    ) select count(*) into deleted_files from removed;
    delete from public.orders where (state = 'packed' and packed_at < now() - make_interval(days => days_to_keep)) or (state = 'cancelled' and cancelled_at < now() - make_interval(days => days_to_keep));
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

revoke all on function public.lookup_order(text) from public, anon;
revoke all on function public.get_order_detail(uuid) from public, anon;
revoke all on function public.pack_order(uuid,text,text) from public, anon;
revoke all on function public.admin_search_orders(text,integer) from public, anon;
revoke all on function public.import_orders(jsonb) from public, anon;
revoke all on function public.purge_expired_operational_data() from public, anon;
grant execute on function public.lookup_order(text) to authenticated;
grant execute on function public.get_order_detail(uuid) to authenticated;
grant execute on function public.pack_order(uuid,text,text) to authenticated;
grant execute on function public.admin_search_orders(text,integer) to authenticated;
grant execute on function public.import_orders(jsonb) to authenticated;
grant execute on function public.purge_expired_operational_data() to authenticated, service_role;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.warehouses enable row level security;
alter table public.locations enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_barcodes enable row level security;
alter table public.marketplaces enable row level security;
alter table public.marketplace_products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.devices enable row level security;
alter table public.packing_events enable row level security;
alter table public.marketplace_integrations enable row level security;
alter table public.sync_runs enable row level security;
alter table public.system_settings enable row level security;
alter table public.cleanup_runs enable row level security;
alter table public.daily_aggregate_metrics enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.user_roles, public.warehouses, public.locations, public.products, public.product_images, public.product_barcodes, public.marketplaces, public.marketplace_products, public.orders, public.order_items, public.packing_events to authenticated;
grant insert, update on public.devices to authenticated;
grant select on public.devices to authenticated;
grant insert, update, delete on public.warehouses, public.locations, public.products, public.product_images, public.product_barcodes, public.marketplaces, public.marketplace_products, public.orders, public.order_items to authenticated;
grant select, insert, update on public.sync_runs to authenticated;
grant select, insert, update on public.system_settings to authenticated;
grant select, insert, update, delete on public.marketplace_integrations to authenticated;
grant select on public.cleanup_runs, public.daily_aggregate_metrics to authenticated;

create policy profiles_select on public.profiles for select to authenticated using (id = (select auth.uid()) or private.is_admin());
create policy profiles_admin_update on public.profiles for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy roles_select on public.user_roles for select to authenticated using (user_id = (select auth.uid()) or private.is_admin());
create policy roles_super_admin_all on public.user_roles for all to authenticated using (private.is_super_admin()) with check (private.is_super_admin());

create policy warehouses_active_read on public.warehouses for select to authenticated using (active or private.is_admin());
create policy warehouses_admin_write on public.warehouses for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy locations_active_read on public.locations for select to authenticated using (active or private.is_admin());
create policy locations_admin_write on public.locations for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy products_active_read on public.products for select to authenticated using (active or private.is_admin());
create policy products_admin_write on public.products for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy product_images_read on public.product_images for select to authenticated using (exists(select 1 from public.products p where p.id = product_id and (p.active or private.is_admin())));
create policy product_images_admin_write on public.product_images for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy product_barcodes_read on public.product_barcodes for select to authenticated using (exists(select 1 from public.products p where p.id = product_id and (p.active or private.is_admin())));
create policy product_barcodes_admin_write on public.product_barcodes for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy marketplaces_active_read on public.marketplaces for select to authenticated using (active or private.is_admin());
create policy marketplaces_admin_write on public.marketplaces for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy marketplace_products_read on public.marketplace_products for select to authenticated using (true);
create policy marketplace_products_admin_write on public.marketplace_products for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy orders_active_read on public.orders for select to authenticated using (private.current_user_role() is not null);
create policy orders_admin_write on public.orders for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy order_items_read on public.order_items for select to authenticated using (exists(select 1 from public.orders o where o.id = order_id));
create policy order_items_admin_write on public.order_items for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy packing_events_select on public.packing_events for select to authenticated using (worker_user_id = (select auth.uid()) or private.is_admin());
create policy devices_select on public.devices for select to authenticated using (user_id = (select auth.uid()) or private.is_admin());
create policy devices_insert on public.devices for insert to authenticated with check (user_id = (select auth.uid()));
create policy devices_update on public.devices for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy integrations_super_admin on public.marketplace_integrations for all to authenticated using (private.is_super_admin()) with check (private.is_super_admin());
create policy sync_runs_admin on public.sync_runs for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy settings_admin_select on public.system_settings for select to authenticated using (private.is_admin());
create policy settings_super_admin_write on public.system_settings for all to authenticated using (private.is_super_admin()) with check (private.is_super_admin());
create policy cleanup_admin_select on public.cleanup_runs for select to authenticated using (private.is_admin());
create policy metrics_admin_select on public.daily_aggregate_metrics for select to authenticated using (private.is_admin());

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('product-artwork', 'product-artwork', false, 10485760, array['image/jpeg','image/png','image/webp']), ('temporary-labels', 'temporary-labels', false, 10485760, array['application/pdf','image/png'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy artwork_read on storage.objects for select to authenticated using (bucket_id = 'product-artwork' and private.current_user_role() is not null);
create policy artwork_admin_insert on storage.objects for insert to authenticated with check (bucket_id = 'product-artwork' and private.is_admin());
create policy artwork_admin_update on storage.objects for update to authenticated using (bucket_id = 'product-artwork' and private.is_admin()) with check (bucket_id = 'product-artwork' and private.is_admin());
create policy artwork_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'product-artwork' and private.is_admin());
create policy labels_read on storage.objects for select to authenticated using (bucket_id = 'temporary-labels' and private.is_admin());
create policy labels_admin_write on storage.objects for all to authenticated using (bucket_id = 'temporary-labels' and private.is_admin()) with check (bucket_id = 'temporary-labels' and private.is_admin());

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'packing_events') then alter publication supabase_realtime add table public.packing_events; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then alter publication supabase_realtime add table public.orders; end if;
end $$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'reyo-pack-retention') then perform cron.unschedule('reyo-pack-retention'); end if;
  perform cron.schedule('reyo-pack-retention', '15 2 * * *', 'select public.purge_expired_operational_data()');
end $$;

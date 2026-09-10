-- Supabase Storage forbids direct SQL deletes because they can orphan the backing file.
-- Reyo Pack does not currently create temporary label objects, so keep Storage untouched
-- and let the operational database retention job complete safely.
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
  deleted_devices integer := 0;
begin
  if session_user <> 'postgres'
    and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
    and ((select auth.uid()) is null or private.is_admin() is false)
  then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  select greatest(value::integer, 7) into days_to_keep
  from public.system_settings where key = 'retention_days';
  days_to_keep := coalesce(days_to_keep, 7);
  insert into public.cleanup_runs(status) values ('running') returning id into run_id;
  begin
    insert into public.daily_aggregate_metrics(metric_date, worker_key, marketplace, sku, packed_orders, packed_units)
    select pe.packed_at::date, pe.worker_user_id::text, pe.marketplace, pe.sku, count(*), sum(pe.quantity)
    from public.packing_events pe
    join public.orders o on o.id = pe.order_id
    where o.state = 'packed'
      and o.handed_over
      and o.packed_at < now() - make_interval(days => days_to_keep)
    group by pe.packed_at::date, pe.worker_user_id, pe.marketplace, pe.sku
    on conflict (metric_date, worker_key, marketplace, sku) do update
    set packed_orders = public.daily_aggregate_metrics.packed_orders + excluded.packed_orders,
        packed_units = public.daily_aggregate_metrics.packed_units + excluded.packed_units,
        updated_at = now();

    delete from public.orders
    where (state = 'packed' and handed_over and packed_at < now() - make_interval(days => days_to_keep))
       or (state = 'cancelled' and cancelled_at < now() - make_interval(days => days_to_keep));
    get diagnostics deleted_orders = row_count;
    delete from public.sync_runs where finished_at < now() - make_interval(days => days_to_keep);
    delete from public.devices where last_seen_at < now() - make_interval(days => days_to_keep);
    get diagnostics deleted_devices = row_count;
    update public.cleanup_runs
    set status = 'succeeded', records_deleted = deleted_orders,
        storage_objects_deleted = 0, finished_at = now()
    where id = run_id;
    return jsonb_build_object(
      'status', 'succeeded', 'deletedOrders', deleted_orders,
      'deletedStorageObjects', 0, 'deletedDevices', deleted_devices,
      'retentionDays', days_to_keep
    );
  exception when others then
    update public.cleanup_runs
    set status = 'failed', error_message = left(sqlerrm, 500), finished_at = now()
    where id = run_id;
    return jsonb_build_object('status', 'failed', 'error', left(sqlerrm, 500), 'retentionDays', days_to_keep);
  end;
end;
$$;

revoke all on function public.purge_expired_operational_data() from public, anon;
grant execute on function public.purge_expired_operational_data() to authenticated, service_role;

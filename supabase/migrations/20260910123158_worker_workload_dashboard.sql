create function public.worker_workload(p_filter text default 'all', p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if auth.uid() is null or private.current_user_role() is null then
    raise exception 'Unauthorized' using errcode='42501';
  end if;
  if p_page is null or p_page < 1 or p_filter is null or p_filter not in ('all','today','upcoming','unpacked','packed','waiting','overdue') then
    raise exception 'Invalid workload filter or page';
  end if;
  with eligible as materialized (
    select o.*, case
      when not handed_over and ship_by_date < today and state <> 'packed' then 0
      when not handed_over and ship_by_date = today and state <> 'packed' then 1
      when not handed_over and ship_by_date < today then 2
      when not handed_over and ship_by_date = today then 3
      when not handed_over then 4 else 5 end as urgency
    from public.orders o
    where state <> 'cancelled' and upper(coalesce(marketplace_status,'')) not in ('CANCELLED','UNFULFILLABLE')
      and upper(coalesce(raw_payload #>> '{fulfillment,fulfilledBy}','MERCHANT')) <> 'AMAZON'
  ), matching as materialized (
    select * from eligible where case p_filter
      when 'all' then true
      when 'today' then ship_by_date=today and not handed_over
      when 'upcoming' then ship_by_date>today and not handed_over
      when 'unpacked' then state<>'packed' and not handed_over
      when 'packed' then state='packed'
      when 'waiting' then state='packed' and not handed_over
      when 'overdue' then ship_by_date<today and not handed_over end
  ), page as (
    select id,ship_by_date,handed_over,marketplace_status,urgency from matching
    order by urgency,ship_by_date nulls last,created_at,id limit 50 offset (p_page::bigint-1)*50
  )
  select jsonb_build_object(
    'date',today,'page',p_page,'pageSize',50,'total',(select count(*) from matching),
    'counts',(select jsonb_build_object(
      'today',count(*) filter(where ship_by_date=today and not handed_over),
      'unpacked',count(*) filter(where ship_by_date=today and state<>'packed' and not handed_over),
      'packed',count(*) filter(where ship_by_date=today and state='packed' and not handed_over),
      'waiting',count(*) filter(where state='packed' and not handed_over),
      'overdue',count(*) filter(where ship_by_date<today and not handed_over)) from eligible),
    'orders',coalesce((select jsonb_agg(private.order_json(id)||jsonb_build_object(
      'shipByDate',ship_by_date,'handedOver',handed_over,'marketplaceStatus',marketplace_status)
      order by urgency,ship_by_date nulls last,id) from page),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.worker_workload(text,integer) from public,anon;
grant execute on function public.worker_workload(text,integer) to authenticated;

create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'reyo-pack-amazon-sync'
  ) then
    perform cron.unschedule('reyo-pack-amazon-sync');
  end if;
end
$$;

select cron.schedule(
  'reyo-pack-amazon-sync',
  '*/30 * * * *',
  $job$
    with sync_config as (
      select
        max(decrypted_secret) filter (where name = 'reyo_pack_app_url') as app_url,
        max(decrypted_secret) filter (where name = 'reyo_pack_cron_secret') as cron_secret
      from vault.decrypted_secrets
      where name in ('reyo_pack_app_url', 'reyo_pack_cron_secret')
    )
    select net.http_get(
      url := rtrim(app_url, '/') || '/api/cron/sync',
      headers := jsonb_build_object(
        'Accept', 'application/json',
        'Authorization', 'Bearer ' || cron_secret
      ),
      timeout_milliseconds := 300000
    )
    from sync_config
    where app_url ~ '^https://[^[:space:]]+$'
      and nullif(btrim(cron_secret), '') is not null;
  $job$
);

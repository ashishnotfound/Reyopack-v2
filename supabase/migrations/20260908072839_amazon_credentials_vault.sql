-- Amazon credentials are encrypted by Supabase Vault. The public table stores
-- only the opaque Vault secret identifier so no credential value is exposed
-- through PostgREST, backups of public tables, or the browser.
create extension if not exists supabase_vault with schema vault;

create or replace function public.get_marketplace_credentials(p_marketplace_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if p_marketplace_key <> 'amazon' then
    raise exception 'Unsupported marketplace integration';
  end if;

  select ds.decrypted_secret::jsonb || jsonb_build_object(
    'updatedAt', mi.updated_at,
    'active', mi.active
  )
  into result
  from public.marketplace_integrations mi
  join public.marketplaces m on m.id = mi.marketplace_id
  join vault.decrypted_secrets ds on ds.id = mi.encrypted_credentials::uuid
  where m.key = p_marketplace_key
    and mi.active
  limit 1;

  return result;
end;
$$;

create or replace function public.set_marketplace_credentials(
  p_marketplace_key text,
  p_credentials jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  marketplace_uuid uuid;
  secret_uuid uuid;
  secret_name text := 'reyo_pack_amazon_credentials';
begin
  if p_marketplace_key <> 'amazon' then
    raise exception 'Unsupported marketplace integration';
  end if;

  if jsonb_typeof(p_credentials) <> 'object'
    or coalesce(length(p_credentials->>'clientId'), 0) = 0
    or coalesce(length(p_credentials->>'clientSecret'), 0) = 0
    or coalesce(length(p_credentials->>'refreshToken'), 0) = 0
    or coalesce(length(p_credentials->>'endpoint'), 0) = 0
    or jsonb_array_length(coalesce(p_credentials->'marketplaceIds', '[]'::jsonb)) = 0 then
    raise exception 'Marketplace credentials are incomplete';
  end if;

  select id into marketplace_uuid
  from public.marketplaces
  where key = p_marketplace_key;

  if marketplace_uuid is null then
    raise exception 'Marketplace does not exist';
  end if;

  select id into secret_uuid
  from vault.secrets
  where name = secret_name
  limit 1;

  if secret_uuid is null then
    secret_uuid := vault.create_secret(
      p_credentials::text,
      secret_name,
      'Amazon SP-API credentials managed by the Reyo Pack Super Admin panel'
    );
  else
    perform vault.update_secret(
      secret_uuid,
      p_credentials::text,
      secret_name,
      'Amazon SP-API credentials managed by the Reyo Pack Super Admin panel'
    );
  end if;

  insert into public.marketplace_integrations(
    marketplace_id,
    encrypted_credentials,
    key_version,
    active
  )
  values (marketplace_uuid, secret_uuid::text, 2, true)
  on conflict (marketplace_id) do update
  set encrypted_credentials = excluded.encrypted_credentials,
      key_version = excluded.key_version,
      active = true,
      updated_at = now();

  return jsonb_build_object('configured', true);
end;
$$;

revoke all on function public.get_marketplace_credentials(text) from public, anon, authenticated;
revoke all on function public.set_marketplace_credentials(text, jsonb) from public, anon, authenticated;
grant execute on function public.get_marketplace_credentials(text) to service_role;
grant execute on function public.set_marketplace_credentials(text, jsonb) to service_role;

-- All reads and writes go through the server-only functions above. Existing RLS
-- remains enabled as defense in depth.
revoke all on public.marketplace_integrations from authenticated;

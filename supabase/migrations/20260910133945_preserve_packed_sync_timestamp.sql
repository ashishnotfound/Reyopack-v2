create or replace function private.preserve_order_progress() returns trigger language plpgsql set search_path='' as $$
begin
  if new.marketplace_updated_at is distinct from old.marketplace_updated_at
    and new.marketplace_updated_at < old.marketplace_updated_at then return old; end if;
  if old.state='packed' and new.state in ('pending','packed') then
    new.state := 'packed';
    new.packed_at := coalesce(new.packed_at,old.packed_at);
  end if;
  if old.state='cancelled' then
    new.state := 'cancelled';
    new.cancelled_at := coalesce(new.cancelled_at,old.cancelled_at,old.marketplace_updated_at,old.updated_at,now());
  end if;
  return new;
end $$;

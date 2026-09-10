alter table public.sync_failures add column resolved_at timestamptz;
create index sync_failures_unresolved_idx on public.sync_failures(sync_run_id) where resolved_at is null;

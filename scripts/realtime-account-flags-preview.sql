-- Prepare only in the approved staging database. No account is enabled by default.
create table if not exists realtime_account_flags (
  environment text not null check (environment in ('preview', 'production')),
  login_id text not null,
  enabled boolean not null default false,
  check_interval_ms integer not null default 5000 check (check_interval_ms in (5000, 30000, 60000)),
  updated_at timestamptz not null default now(),
  primary key (environment, login_id)
);
-- login_id stores the owner MASTER login id. One row controls the whole group.
-- Operator example (use an authenticated database console; no public mutation endpoint):
-- insert into realtime_account_flags(environment, login_id, enabled)
-- values ('preview', 'maple', true)
-- on conflict (environment, login_id) do update
-- set enabled = excluded.enabled, updated_at = now();
-- Rollback: change true to false. Railway broadcasts the change to the group.

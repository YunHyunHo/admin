-- Admin portal production schema draft.
-- Target DB: PostgreSQL / Vercel Postgres / Neon.

create extension if not exists pgcrypto;

create type admin_role as enum (
  'MASTER',
  'ADMIN',
  'VIEWER',
  'DOMAIN_ADMIN'
);

create type admin_status as enum (
  'ACTIVE',
  'SUSPENDED',
  'DELETED'
);

create type request_status as enum (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'COMPLETED',
  'CANCELED'
);

create type settlement_status as enum (
  'DRAFT',
  'CONFIRMED',
  'PAID',
  'CANCELED'
);

create table admins (
  id uuid primary key default gen_random_uuid(),
  login_id text not null unique,
  password_hash text not null,
  password_ciphertext text,
  name text not null,
  role admin_role not null,
  status admin_status not null default 'ACTIVE',
  memo text,
  created_by uuid references admins(id),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table companies (
  id uuid primary key default gen_random_uuid(),
  company_name text not null unique,
  status admin_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table admin_company_mappings (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references admins(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (admin_id, company_id)
);

create table distributors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  admin_id uuid references admins(id) on delete set null,
  parent_distributor_id uuid references distributors(id),
  name text not null,
  level text not null default 'DISTRIBUTOR',
  current_balance numeric(18, 0) not null default 0,
  status admin_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table domains (
  id uuid primary key default gen_random_uuid(),
  domain_name text not null unique,
  company_id uuid not null references companies(id),
  distributor_id uuid references distributors(id),
  status admin_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table admin_domain_mappings (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references admins(id) on delete cascade,
  domain_id uuid not null references domains(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (admin_id, domain_id)
);

create table fee_rates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  domain_id uuid references domains(id),
  distributor_id uuid references distributors(id),
  company_rate numeric(8, 4) not null default 0,
  distributor_rate numeric(8, 4) not null default 0,
  agency_rate numeric(8, 4) not null default 0,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references admins(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (company_rate >= 0),
  check (distributor_rate >= 0),
  check (agency_rate >= 0)
);

create table bank_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  distributor_id uuid references distributors(id),
  bank_name text not null,
  account_number text not null,
  account_holder text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table charge_requests (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  company_id uuid not null references companies(id),
  domain_id uuid not null references domains(id),
  distributor_id uuid references distributors(id),
  user_uid text not null,
  bank_name text,
  account_number text,
  depositor text,
  amount numeric(18, 0) not null,
  status request_status not null default 'PENDING',
  requested_at timestamptz not null,
  processed_at timestamptz,
  processed_by uuid references admins(id),
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount >= 0)
);

create table exchange_requests (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  company_id uuid not null references companies(id),
  domain_id uuid references domains(id),
  distributor_id uuid references distributors(id),
  user_uid text not null,
  bank_name text,
  account_number text,
  account_holder text,
  amount numeric(18, 0) not null,
  status request_status not null default 'PENDING',
  requested_at timestamptz not null,
  processed_at timestamptz,
  processed_by uuid references admins(id),
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount >= 0)
);

create table commission_records (
  id uuid primary key default gen_random_uuid(),
  charge_request_id uuid not null references charge_requests(id),
  company_id uuid not null references companies(id),
  domain_id uuid not null references domains(id),
  distributor_id uuid references distributors(id),
  charge_amount numeric(18, 0) not null,
  commission_rate numeric(8, 4) not null,
  company_fee numeric(18, 0) not null default 0,
  distributor_fee numeric(18, 0) not null default 0,
  saved_commission numeric(18, 0) not null default 0,
  status request_status not null default 'APPROVED',
  created_at timestamptz not null default now(),
  unique (charge_request_id),
  check (charge_amount >= 0),
  check (commission_rate >= 0)
);

create table distributor_settlements (
  id uuid primary key default gen_random_uuid(),
  settlement_date date not null,
  company_id uuid not null references companies(id),
  distributor_id uuid not null references distributors(id),
  domain_id uuid references domains(id),
  charge_amount numeric(18, 0) not null default 0,
  exchange_amount numeric(18, 0) not null default 0,
  company_fee numeric(18, 0) not null default 0,
  distributor_fee numeric(18, 0) not null default 0,
  distributor_balance_change numeric(18, 0) not null default 0,
  status settlement_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (settlement_date, distributor_id, domain_id)
);

create table domain_settlements (
  id uuid primary key default gen_random_uuid(),
  settlement_date date not null,
  company_id uuid not null references companies(id),
  domain_id uuid not null references domains(id),
  distributor_id uuid references distributors(id),
  charge_total numeric(18, 0) not null default 0,
  exchange_total numeric(18, 0) not null default 0,
  company_fee numeric(18, 0) not null default 0,
  distributor_fee numeric(18, 0) not null default 0,
  charge_count integer not null default 0,
  exchange_count integer not null default 0,
  settlement_amount numeric(18, 0) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (settlement_date, domain_id)
);

create table distributor_withdrawals (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references distributors(id),
  request_amount numeric(18, 0) not null,
  before_balance numeric(18, 0) not null,
  after_balance numeric(18, 0) not null,
  bank_name text not null,
  account_number text not null,
  account_holder text not null,
  status request_status not null default 'PENDING',
  admin_memo text,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references admins(id),
  balance_deducted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (request_amount > 0),
  check (before_balance >= 0),
  check (after_balance >= 0)
);

create table distributor_balance_transactions (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references distributors(id),
  amount numeric(18, 0) not null,
  balance_before numeric(18, 0) not null,
  balance_after numeric(18, 0) not null,
  source_type text not null,
  source_id uuid not null,
  memo text,
  created_by uuid references admins(id),
  created_at timestamptz not null default now(),
  unique (source_type, source_id),
  check (balance_before >= 0),
  check (balance_after >= 0),
  check (amount <> 0)
);

create table admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references admins(id),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  before_data jsonb,
  after_data jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index admins_role_status_idx on admins (role, status);
create unique index distributors_admin_id_idx on distributors (admin_id) where admin_id is not null;
create index domains_company_idx on domains (company_id);
create index domains_distributor_idx on domains (distributor_id);
create index charge_requests_scope_idx on charge_requests (company_id, domain_id, status, requested_at);
create index exchange_requests_scope_idx on exchange_requests (company_id, domain_id, status, requested_at);
create index commission_records_scope_idx on commission_records (company_id, domain_id, distributor_id, created_at);
create index distributor_settlements_date_idx on distributor_settlements (settlement_date, distributor_id);
create index domain_settlements_date_idx on domain_settlements (settlement_date, domain_id);
create index distributor_withdrawals_status_idx on distributor_withdrawals (status, requested_at);
create index distributor_balance_transactions_distributor_idx on distributor_balance_transactions (distributor_id, created_at);

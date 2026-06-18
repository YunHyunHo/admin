import type { PoolClient } from "pg";

import { query } from "@/lib/db";

let schemaReady = false;

export async function ensureFeeRateSchema(client?: Pick<PoolClient, "query">) {
  if (schemaReady) {
    return;
  }

  const runner = client ?? { query };

  await runner.query(`
    alter table fee_rates
    add column if not exists sub_distributor_id uuid references distributors(id)
  `);
  await runner.query(`
    alter table fee_rates
    add column if not exists sub_distributor_rate numeric(8, 4) not null default 0
  `);
  await runner.query(`
    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conname = 'fee_rates_sub_distributor_rate_check'
      ) then
        alter table fee_rates
        add constraint fee_rates_sub_distributor_rate_check
        check (sub_distributor_rate >= 0);
      end if;
    end $$;
  `);
  await runner.query(`
    create table if not exists fee_rate_partners (
      id uuid primary key default gen_random_uuid(),
      fee_rate_id uuid not null references fee_rates(id) on delete cascade,
      position integer not null check (position between 1 and 3),
      distributor_id uuid not null references distributors(id),
      rate numeric(8, 4) not null default 0 check (rate >= 0),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (fee_rate_id, position)
    )
  `);
  await runner.query(`
    create index if not exists idx_fee_rate_partners_fee_rate_position
      on fee_rate_partners (fee_rate_id, position)
  `);

  schemaReady = true;
}

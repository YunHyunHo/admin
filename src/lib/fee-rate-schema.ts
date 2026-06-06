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

  schemaReady = true;
}

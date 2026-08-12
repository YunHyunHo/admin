import type { SessionUser } from "@/lib/auth";
import { getChargeRequestScope } from "@/lib/charge-requests-repository";
import { query } from "@/lib/db";
import { getWithdrawalScope } from "@/lib/distributor-withdrawals-repository";
import { getScopedDataCondition } from "@/lib/master-scope";

type PendingRequestIdRow = {
  charges: string[];
  domain_exchanges: string[];
  distributor_withdrawals: string[];
};

function shiftSqlParams(sql: string, offset: number) {
  return sql.replace(/\$(\d+)/g, (_, indexText) =>
    `$${Number(indexText) + offset}`,
  );
}

export async function getPendingRequestIds(user: SessionUser) {
  const [chargeScope, domainExchangeScope, withdrawalScope] = await Promise.all([
    getChargeRequestScope(user),
    getScopedDataCondition(user, {
      company: "er",
      distributor: "dist",
      distributorAdmin: "dist_admin",
    }),
    getWithdrawalScope(user),
  ]);

  const domainExchangeScopeSql = shiftSqlParams(
    domainExchangeScope.sql,
    chargeScope.values.length,
  );
  const withdrawalScopeSql = shiftSqlParams(
    withdrawalScope.sql,
    chargeScope.values.length + domainExchangeScope.values.length,
  );
  const result = await query<PendingRequestIdRow>(
    `
      select
        array(
          select cr.id::text
          from charge_requests cr
          left join distributors dist on dist.id = cr.distributor_id
          left join admins dist_admin on dist_admin.id = dist.admin_id
          where cr.status = 'PENDING'
            ${chargeScope.sql}
          order by cr.requested_at desc, cr.created_at desc
        ) as charges,
        array(
          select er.id::text
          from exchange_requests er
          left join distributors dist on dist.id = er.distributor_id
          left join admins dist_admin on dist_admin.id = dist.admin_id
          where er.status = 'PENDING'
            ${domainExchangeScopeSql}
          order by er.requested_at desc
        ) as domain_exchanges,
        array(
          select dw.id::text
          from distributor_withdrawals dw
          join distributors d on d.id = dw.distributor_id
          left join admins dist_admin on dist_admin.id = d.admin_id
          where dw.status = 'PENDING'
            ${withdrawalScopeSql}
          order by dw.requested_at desc
        ) as distributor_withdrawals
    `,
    [
      ...chargeScope.values,
      ...domainExchangeScope.values,
      ...withdrawalScope.values,
    ],
  );
  const row = result.rows[0];

  return {
    charges: row?.charges ?? [],
    domainExchanges: row?.domain_exchanges ?? [],
    distributorWithdrawals: row?.distributor_withdrawals ?? [],
  };
}

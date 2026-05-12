import {
  getDomainSettlement,
  getSettlementProfit,
} from "@/lib/mock-report-service";
import { getAdminSettingsFromCookie } from "@/lib/settings-cookie";
import { getMockChargeStateFromCookie } from "@/lib/mock-state-cookie";
import { hasDatabaseUrl, query } from "@/lib/db";
import { getScopedDistributorCondition } from "@/lib/master-scope";
import type { SessionUser } from "@/lib/auth";

type SettlementAggregateRow = {
  date: string;
  domain_name: string;
  charge_total: string;
  exchange_total: string;
  fee_total: string;
};

function toMmDd(isoDate: string) {
  return isoDate.slice(5);
}

async function getCommissionAggregates(
  user: SessionUser,
  startDate: string,
  endDate: string,
) {
  const scope = getScopedDistributorCondition(user);
  const result = await query<SettlementAggregateRow>(
    `
      select
        date::text,
        domain_name,
        coalesce(sum(charge_total), 0)::text as charge_total,
        coalesce(sum(exchange_total), 0)::text as exchange_total,
        coalesce(sum(fee_total), 0)::text as fee_total
      from (
        select
          co.created_at::date as date,
          d.domain_name,
          co.charge_amount as charge_total,
          0::numeric as exchange_total,
          co.saved_commission as fee_total
        from commission_records co
        join domains d on d.id = co.domain_id
        left join distributors dist on dist.id = co.distributor_id
        left join admins dist_admin on dist_admin.id = dist.admin_id
        where
          co.status in ('APPROVED', 'COMPLETED')
          and co.created_at >= $1::date
          and co.created_at < ($2::date + interval '1 day')
          ${scope.sql.replace("$1", "$3")}

        union all

        select
          er.processed_at::date as date,
          d.domain_name,
          0::numeric as charge_total,
          er.amount as exchange_total,
          0::numeric as fee_total
        from exchange_requests er
        join domains d on d.id = er.domain_id
        left join distributors dist on dist.id = er.distributor_id
        left join admins dist_admin on dist_admin.id = dist.admin_id
        where
          er.status in ('APPROVED', 'COMPLETED')
          and er.processed_at is not null
          and er.processed_at >= $1::date
          and er.processed_at < ($2::date + interval '1 day')
          ${scope.sql.replace("$1", "$3")}
      ) daily
      group by date, domain_name
      order by date asc
    `,
    [startDate, endDate, user.id],
  );

  return result.rows;
}

export async function getSettlementProfitForUser(
  user: SessionUser,
  startDate: string,
  endDate: string,
) {
  if (!hasDatabaseUrl()) {
    const state = await getMockChargeStateFromCookie();
    const settings = await getAdminSettingsFromCookie();

    return getSettlementProfit(user.companyName, startDate, endDate, state, settings);
  }

  const aggregateRows = await getCommissionAggregates(user, startDate, endDate);
  const domainName = aggregateRows[0]?.domain_name ?? "전체";
  const rows = aggregateRows.map((row) => {
    const chargeTotal = Number(row.charge_total);
    const exchangeTotal = Number(row.exchange_total);
    const feeTotal = Number(row.fee_total);

    return {
      date: toMmDd(row.date),
      chargeTotal,
      feeTotal,
      payoutTotal: exchangeTotal,
    };
  });

  return {
    domainName,
    feeRate: rows.length ? (rows[0].feeTotal / rows[0].chargeTotal) * 100 : 0,
    rows,
    totals: rows.reduce(
      (sum, row) => ({
        chargeTotal: sum.chargeTotal + row.chargeTotal,
        feeTotal: sum.feeTotal + row.feeTotal,
        payoutTotal: sum.payoutTotal + row.payoutTotal,
      }),
      { chargeTotal: 0, feeTotal: 0, payoutTotal: 0 },
    ),
  };
}

export async function getDomainSettlementForUser(
  user: SessionUser,
  startDate: string,
  endDate: string,
) {
  if (!hasDatabaseUrl()) {
    const state = await getMockChargeStateFromCookie();
    const settings = await getAdminSettingsFromCookie();

    return getDomainSettlement(user.companyName, startDate, endDate, state, settings);
  }

  const aggregateRows = await getCommissionAggregates(user, startDate, endDate);
  const domainName = aggregateRows[0]?.domain_name ?? "전체";
  const rows = aggregateRows.map((row) => {
    const charge = Number(row.charge_total);
    const exchange = Number(row.exchange_total);
    const distributor = Number(row.fee_total);

    return {
      date: row.date,
      charge,
      exchange,
      distributor,
    };
  });

  return {
    domainName,
    rows,
    total: rows.reduce(
      (sum, row) => ({
        charge: sum.charge + row.charge,
        exchange: sum.exchange + row.exchange,
        distributor: sum.distributor + row.distributor,
      }),
      { charge: 0, exchange: 0, distributor: 0 },
    ),
  };
}

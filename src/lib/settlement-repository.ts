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
  domain_name: string | null;
  top_distributor_name: string | null;
  distributor_name: string | null;
  charge_total: string;
  exchange_total: string;
  company_fee_total: string;
  top_distributor_fee_total: string;
  distributor_fee_total: string;
};

function toMmDd(isoDate: string) {
  return isoDate.slice(5);
}

async function getCommissionAggregates(
  user: SessionUser,
  startDate: string,
  endDate: string,
) {
  const scope =
    user.role === "MASTER"
      ? { sql: "", values: [] as string[] }
      : getScopedDistributorCondition(user);
  const scopeSql = scope.sql.replaceAll("$1", "$3");
  const values = user.role === "MASTER"
    ? [startDate, endDate]
    : [startDate, endDate, user.id];
  const result = await query<SettlementAggregateRow>(
    `
      select
        date::text,
        coalesce(domain_name, '-') as domain_name,
        top_distributor_name,
        distributor_name,
        coalesce(sum(charge_total), 0)::text as charge_total,
        coalesce(sum(exchange_total), 0)::text as exchange_total,
        coalesce(sum(company_fee_total), 0)::text as company_fee_total,
        coalesce(sum(top_distributor_fee_total), 0)::text as top_distributor_fee_total,
        coalesce(sum(distributor_fee_total), 0)::text as distributor_fee_total
      from (
        select
          co.created_at::date as date,
          coalesce(d.domain_name, '-') as domain_name,
          coalesce(parent_dist.name, dist.name) as top_distributor_name,
          case when parent_dist.id is null then null else dist.name end as distributor_name,
          co.charge_amount as charge_total,
          0::numeric as exchange_total,
          co.company_fee as company_fee_total,
          co.distributor_fee as top_distributor_fee_total,
          greatest(co.saved_commission - co.company_fee - co.distributor_fee, 0) as distributor_fee_total
        from commission_records co
        left join domains d on d.id = co.domain_id
        left join distributors dist on dist.id = co.distributor_id
        left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
        left join admins dist_admin on dist_admin.id = dist.admin_id
        where
          co.status in ('APPROVED', 'COMPLETED')
          and co.created_at >= $1::date
          and co.created_at < ($2::date + interval '1 day')
          ${scopeSql}

        union all

        select
          er.processed_at::date as date,
          d.domain_name,
          coalesce(parent_dist.name, dist.name) as top_distributor_name,
          case when parent_dist.id is null then null else dist.name end as distributor_name,
          0::numeric as charge_total,
          er.amount as exchange_total,
          0::numeric as company_fee_total,
          0::numeric as top_distributor_fee_total,
          0::numeric as distributor_fee_total
        from exchange_requests er
        join domains d on d.id = er.domain_id
        left join distributors dist on dist.id = er.distributor_id
        left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
        left join admins dist_admin on dist_admin.id = dist.admin_id
        where
          er.status in ('APPROVED', 'COMPLETED')
          and er.processed_at is not null
          and er.processed_at >= $1::date
          and er.processed_at < ($2::date + interval '1 day')
          ${scopeSql}
      ) daily
      group by date, domain_name, top_distributor_name, distributor_name
      order by date asc
    `,
    values,
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
    const companyFeeTotal = Number(row.company_fee_total);
    const distributorFeeTotal =
      Number(row.top_distributor_fee_total) + Number(row.distributor_fee_total);
    const feeTotal = companyFeeTotal + distributorFeeTotal;

    return {
      date: toMmDd(row.date),
      chargeTotal,
      feeTotal,
      companyFeeTotal,
      distributorFeeTotal,
      payoutTotal: exchangeTotal,
    };
  });
  const sectionMap = new Map<
    string,
    {
      id: string;
      title: string;
      category: "본사" | "상위총판" | "총판";
      rows: typeof rows;
      totals: {
        chargeTotal: number;
        feeTotal: number;
        companyFeeTotal: number;
        distributorFeeTotal: number;
        payoutTotal: number;
      };
    }
  >();
  const addSectionRow = (
    id: string,
    title: string,
    category: "본사" | "상위총판" | "총판",
    row: (typeof rows)[number],
  ) => {
    const section = sectionMap.get(id) ?? {
      id,
      title,
      category,
      rows: [],
      totals: {
        chargeTotal: 0,
        feeTotal: 0,
        companyFeeTotal: 0,
        distributorFeeTotal: 0,
        payoutTotal: 0,
      },
    };

    const existingRow = section.rows.find((sectionRow) => sectionRow.date === row.date);

    if (existingRow) {
      existingRow.chargeTotal += row.chargeTotal;
      existingRow.feeTotal += row.feeTotal;
      existingRow.companyFeeTotal += row.companyFeeTotal;
      existingRow.distributorFeeTotal += row.distributorFeeTotal;
      existingRow.payoutTotal += row.payoutTotal;
    } else {
      section.rows.push(row);
    }

    section.totals.chargeTotal += row.chargeTotal;
    section.totals.feeTotal += row.feeTotal;
    section.totals.companyFeeTotal += row.companyFeeTotal;
    section.totals.distributorFeeTotal += row.distributorFeeTotal;
    section.totals.payoutTotal += row.payoutTotal;
    sectionMap.set(id, section);
  };

  for (const row of aggregateRows) {
    const chargeTotal = Number(row.charge_total);
    const exchangeTotal = Number(row.exchange_total);
    const companyFeeTotal = Number(row.company_fee_total);
    const topDistributorFeeTotal = Number(row.top_distributor_fee_total);
    const distributorFeeTotal = Number(row.distributor_fee_total);
    const base = {
      date: toMmDd(row.date),
      chargeTotal,
      payoutTotal: exchangeTotal,
    };

    addSectionRow("headquarters", "본사", "본사", {
      ...base,
      feeTotal: companyFeeTotal,
      companyFeeTotal,
      distributorFeeTotal: 0,
    });

    if (row.top_distributor_name) {
      addSectionRow(`top:${row.top_distributor_name}`, row.top_distributor_name, "상위총판", {
        ...base,
        feeTotal: topDistributorFeeTotal,
        companyFeeTotal: 0,
        distributorFeeTotal: topDistributorFeeTotal,
      });
    }

    if (row.distributor_name) {
      addSectionRow(`dist:${row.distributor_name}`, row.distributor_name, "총판", {
        ...base,
        feeTotal: distributorFeeTotal,
        companyFeeTotal: 0,
        distributorFeeTotal,
      });
    }
  }
  const sections = [...sectionMap.values()].map((section) => ({
    ...section,
    rows: section.rows.sort((a, b) => a.date.localeCompare(b.date)),
  }));

  return {
    domainName,
    feeRate: rows.length ? (rows[0].feeTotal / rows[0].chargeTotal) * 100 : 0,
    rows,
    sections,
    totals: rows.reduce(
      (sum, row) => ({
        chargeTotal: sum.chargeTotal + row.chargeTotal,
        feeTotal: sum.feeTotal + row.feeTotal,
        companyFeeTotal: sum.companyFeeTotal + row.companyFeeTotal,
        distributorFeeTotal: sum.distributorFeeTotal + row.distributorFeeTotal,
        payoutTotal: sum.payoutTotal + row.payoutTotal,
      }),
      {
        chargeTotal: 0,
        feeTotal: 0,
        companyFeeTotal: 0,
        distributorFeeTotal: 0,
        payoutTotal: 0,
      },
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
    const company = Number(row.company_fee_total);
    const topDistributor = Number(row.top_distributor_fee_total);
    const distributor = Number(row.distributor_fee_total);

    return {
      date: row.date,
      domainName: row.domain_name ?? "-",
      charge,
      exchange,
      company,
      topDistributor,
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
        company: sum.company + row.company,
        topDistributor: sum.topDistributor + row.topDistributor,
        distributor: sum.distributor + row.distributor,
      }),
      {
        charge: 0,
        exchange: 0,
        company: 0,
        topDistributor: 0,
        distributor: 0,
      },
    ),
  };
}

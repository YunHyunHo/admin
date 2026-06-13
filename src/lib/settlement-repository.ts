import {
  getDomainSettlement,
  getSettlementProfit,
} from "@/lib/mock-report-service";
import { getAdminSettingsFromCookie } from "@/lib/settings-cookie";
import { getMockChargeStateFromCookie } from "@/lib/mock-state-cookie";
import { hasDatabaseUrl, query } from "@/lib/db";
import { KOREA_TIME_ZONE } from "@/lib/korean-time";
import { getScopedDataCondition } from "@/lib/master-scope";
import type { SessionUser } from "@/lib/auth";

type SettlementAggregateRow = {
  date: string;
  domain_id: string | null;
  domain_name: string | null;
  top_distributor_id: string | null;
  distributor_id: string | null;
  top_distributor_name: string | null;
  distributor_name: string | null;
  charge_total: string;
  exchange_total: string;
  company_fee_total: string;
  top_distributor_fee_total: string;
  distributor_fee_total: string;
};

type DomainSettlementSeedRow = {
  domain_id: string;
  domain_name: string;
};

type ProfitSectionSeedRow = {
  id: string;
  title: string;
  category: "상위총판" | "총판";
};

function toMmDd(isoDate: string) {
  return isoDate.slice(5);
}

function getDateRange(startDate: string, endDate: string) {
  const dates: string[] = [];
  const current = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

async function getDomainSettlementSeeds(user: SessionUser) {
  const scope = await getScopedDataCondition(user, {
    company: "d",
    distributor: "dist",
    distributorAdmin: "dist_admin",
  });
  const result = await query<DomainSettlementSeedRow>(
    `
      select
        d.id::text as domain_id,
        coalesce(nullif(d.domain_name, ''), c.company_name, '-') as domain_name
      from domains d
      join companies c on c.id = d.company_id
      left join distributors dist on dist.id = d.distributor_id
      left join admins dist_admin on dist_admin.id = dist.admin_id
      where d.status = 'ACTIVE'
        ${scope.sql}
      order by d.created_at asc, domain_name asc
    `,
    scope.values,
  );

  return result.rows;
}

async function getProfitSectionSeeds(user: SessionUser) {
  const scope =
    user.role === "MASTER"
      ? { sql: "", values: [] as string[] }
      : user.role === "TOP_DISTRIBUTOR"
        ? {
            sql: `
              and (
                d.admin_id = $1::uuid
                or d.parent_distributor_id in (
                  select own_dist.id
                  from distributors own_dist
                  where own_dist.admin_id = $1::uuid
                    and own_dist.status = 'ACTIVE'
                )
              )
            `,
            values: [user.id],
          }
        : { sql: "and d.admin_id = $1::uuid", values: [user.id] };
  const result = await query<ProfitSectionSeedRow>(
    `
      select
        case when d.parent_distributor_id is null then 'top:' else 'dist:' end || d.id::text as id,
        d.name as title,
        case when d.parent_distributor_id is null then '상위총판' else '총판' end as category
      from distributors d
      where d.status = 'ACTIVE'
        ${scope.sql}
      order by
        case when d.parent_distributor_id is null then 0 else 1 end,
        d.created_at asc,
        d.name asc
    `,
    scope.values,
  );

  return result.rows;
}

async function getCommissionAggregates(
  user: SessionUser,
  startDate: string,
  endDate: string,
) {
  const commissionScope = await getScopedDataCondition(user, {
    company: "co",
    distributor: "dist",
    distributorAdmin: "dist_admin",
  });
  const exchangeScope = await getScopedDataCondition(user, {
    company: "er",
    distributor: "dist",
    distributorAdmin: "dist_admin",
  });
  const commissionScopeSql = commissionScope.sql.replaceAll("$1", "$3");
  const exchangeScopeSql = exchangeScope.sql.replaceAll("$1", "$3");
  const scopedValues = commissionScope.values.length
    ? commissionScope.values
    : exchangeScope.values;
  const values = [startDate, endDate, ...scopedValues];
  const result = await query<SettlementAggregateRow>(
    `
      select
        date::text,
        domain_id,
        coalesce(domain_name, '-') as domain_name,
        top_distributor_id,
        distributor_id,
        max(top_distributor_name) as top_distributor_name,
        max(distributor_name) as distributor_name,
        coalesce(sum(charge_total), 0)::text as charge_total,
        coalesce(sum(exchange_total), 0)::text as exchange_total,
        coalesce(sum(company_fee_total), 0)::text as company_fee_total,
        coalesce(sum(top_distributor_fee_total), 0)::text as top_distributor_fee_total,
        coalesce(sum(distributor_fee_total), 0)::text as distributor_fee_total
      from (
        select
          (coalesce(cr.processed_at, co.created_at) at time zone '${KOREA_TIME_ZONE}')::date as date,
          d.id::text as domain_id,
          coalesce(nullif(d.domain_name, ''), c.company_name, '-') as domain_name,
          coalesce(parent_dist.id, dist.id)::text as top_distributor_id,
          case when parent_dist.id is null then null else dist.id::text end as distributor_id,
          coalesce(parent_dist.name, dist.name) as top_distributor_name,
          case when parent_dist.id is null then null else dist.name end as distributor_name,
          co.charge_amount as charge_total,
          0::numeric as exchange_total,
          co.company_fee as company_fee_total,
          co.distributor_fee as top_distributor_fee_total,
          greatest(co.saved_commission - co.company_fee - co.distributor_fee, 0) as distributor_fee_total
        from commission_records co
        join charge_requests cr on cr.id = co.charge_request_id
        join companies c on c.id = co.company_id
        left join domains d on d.id = co.domain_id
        left join distributors dist on dist.id = co.distributor_id
        left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
        left join admins dist_admin on dist_admin.id = dist.admin_id
        where
          co.status in ('APPROVED', 'COMPLETED')
          and (coalesce(cr.processed_at, co.created_at) at time zone '${KOREA_TIME_ZONE}')::date >= $1::date
          and (coalesce(cr.processed_at, co.created_at) at time zone '${KOREA_TIME_ZONE}')::date <= $2::date
          ${commissionScopeSql}

        union all

        select
          (er.processed_at at time zone '${KOREA_TIME_ZONE}')::date as date,
          d.id::text as domain_id,
          coalesce(nullif(d.domain_name, ''), c.company_name, '-') as domain_name,
          coalesce(parent_dist.id, dist.id)::text as top_distributor_id,
          case when parent_dist.id is null then null else dist.id::text end as distributor_id,
          coalesce(parent_dist.name, dist.name) as top_distributor_name,
          case when parent_dist.id is null then null else dist.name end as distributor_name,
          0::numeric as charge_total,
          er.amount as exchange_total,
          0::numeric as company_fee_total,
          0::numeric as top_distributor_fee_total,
          0::numeric as distributor_fee_total
        from exchange_requests er
        join companies c on c.id = er.company_id
        join domains d on d.id = er.domain_id
        left join distributors dist on dist.id = er.distributor_id
        left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
        left join admins dist_admin on dist_admin.id = dist.admin_id
        where
          er.status in ('APPROVED', 'COMPLETED')
          and er.processed_at is not null
          and (er.processed_at at time zone '${KOREA_TIME_ZONE}')::date >= $1::date
          and (er.processed_at at time zone '${KOREA_TIME_ZONE}')::date <= $2::date
          ${exchangeScopeSql}
      ) daily
      group by date, domain_id, domain_name, top_distributor_id, distributor_id
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
  const ensureSection = (
    id: string,
    title: string,
    category: "본사" | "상위총판" | "총판",
  ) => {
    if (sectionMap.has(id)) {
      return sectionMap.get(id)!;
    }

    const section = {
      id,
      title,
      category,
      rows: [] as typeof rows,
      totals: {
        chargeTotal: 0,
        feeTotal: 0,
        companyFeeTotal: 0,
        distributorFeeTotal: 0,
        payoutTotal: 0,
      },
    };

    sectionMap.set(id, section);
    return section;
  };
  ensureSection("headquarters", "본사", "본사");

  for (const seed of await getProfitSectionSeeds(user)) {
    ensureSection(seed.id, seed.title, seed.category);
  }

  const addSectionRow = (
    id: string,
    title: string,
    category: "본사" | "상위총판" | "총판",
    row: (typeof rows)[number],
  ) => {
    const section = ensureSection(id, title, category);

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

    if (row.top_distributor_id && row.top_distributor_name) {
      addSectionRow(`top:${row.top_distributor_id}`, row.top_distributor_name, "상위총판", {
        ...base,
        feeTotal: topDistributorFeeTotal,
        companyFeeTotal: 0,
        distributorFeeTotal: topDistributorFeeTotal,
      });
    }

    if (row.distributor_id && row.distributor_name) {
      addSectionRow(`dist:${row.distributor_id}`, row.distributor_name, "총판", {
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
  const domainSeeds = await getDomainSettlementSeeds(user);
  const aggregateMap = new Map(
    aggregateRows.map((row) => [
      `${row.domain_id ?? `name:${row.domain_name ?? "-"}`}::${row.date}`,
      row,
    ]),
  );
  const dates = getDateRange(startDate, endDate);
  const domainName = "전체";
  const rows = domainSeeds.flatMap((seed) =>
    dates.map((date) => {
      const aggregate = aggregateMap.get(`${seed.domain_id}::${date}`);
      const charge = Number(aggregate?.charge_total ?? 0);
      const exchange = Number(aggregate?.exchange_total ?? 0);
      const company = Number(aggregate?.company_fee_total ?? 0);
      const topDistributor = Number(aggregate?.top_distributor_fee_total ?? 0);
      const distributor = Number(aggregate?.distributor_fee_total ?? 0);

      return {
        date,
        domainName: seed.domain_name,
        charge,
        exchange,
        company,
        topDistributor,
        distributor,
      };
    }),
  );

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

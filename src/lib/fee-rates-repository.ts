import { getFeeRateByCompanyFromSettings } from "@/lib/charge-utils";
import { hasDatabaseUrl, query, withTransaction } from "@/lib/db";
import { ensureFeeRateSchema } from "@/lib/fee-rate-schema";
import { formatKoreanDateTime } from "@/lib/korean-time";
import {
  getMasterOwnedCompanyExistsCondition,
  getScopedDataCondition,
  getScopedDistributorCondition,
} from "@/lib/master-scope";
import { getAdminSettingsFromCookie } from "@/lib/settings-cookie";
import type { SessionUser } from "@/lib/auth";

export type FeeRateSettingsRow = {
  id: string;
  domainId?: string;
  distributorId?: string;
  topDistributorId?: string;
  subDistributorId?: string;
  vendorName: string;
  domainName: string;
  totalRate: number;
  companyName: string;
  companyRate: number;
  topDistributor: string;
  topDistributorRate: number;
  distributor: string;
  distributorRate: number;
  subDistributor: string;
  subDistributorRate: number;
  updatedAt: string;
};

export type FeeRateDistributorOption = {
  id: string;
  name: string;
  parentDistributorId?: string;
  role: "TOP_DISTRIBUTOR" | "DISTRIBUTOR";
};

type FeeRateDbRow = {
  id: string;
  domain_id: string | null;
  distributor_id: string | null;
  top_distributor_id: string | null;
  sub_distributor_id: string | null;
  distributor_name: string | null;
  child_distributor_names: string | null;
  top_distributor_name: string | null;
  sub_distributor_name: string | null;
  domain_name: string | null;
  company_name: string | null;
  vendor_name: string | null;
  company_rate: string;
  distributor_rate: string;
  agency_rate: string;
  sub_distributor_rate: string;
  updated_at: Date | string;
};

function formatStamp(value: Date | string) {
  return formatKoreanDateTime(value);
}

function getTotalRate(
  row: Pick<
    FeeRateDbRow,
    "company_rate" | "distributor_rate" | "agency_rate" | "sub_distributor_rate"
  >,
) {
  return (
    Number(row.company_rate) +
    Number(row.distributor_rate) +
    Number(row.agency_rate) +
    Number(row.sub_distributor_rate)
  );
}

function toSettingsRow(row: FeeRateDbRow): FeeRateSettingsRow {
  return {
    id: row.id,
    domainId: row.domain_id ?? undefined,
    distributorId: row.distributor_id ?? undefined,
    topDistributorId: row.top_distributor_id ?? undefined,
    subDistributorId: row.sub_distributor_id ?? undefined,
    vendorName: row.vendor_name ?? row.company_name ?? "-",
    domainName: row.domain_name ?? "-",
    totalRate: Number(getTotalRate(row).toFixed(2)),
    companyName: "본사",
    companyRate: Number(row.company_rate),
    topDistributor: row.top_distributor_name ?? "-",
    topDistributorRate: Number(row.distributor_rate),
    distributor: row.distributor_name ?? row.child_distributor_names ?? "-",
    distributorRate: Number(row.agency_rate),
    subDistributor: row.sub_distributor_name ?? "-",
    subDistributorRate: Number(row.sub_distributor_rate),
    updatedAt: formatStamp(row.updated_at),
  };
}

export async function getFeeRateSettingsForUser(user: SessionUser) {
  if (!hasDatabaseUrl()) {
    const settings = await getAdminSettingsFromCookie();
    const feeRate = getFeeRateByCompanyFromSettings(user.companyName, settings);

    return {
      companyName: user.companyName,
      feeRate,
      distributorOptions: [] satisfies FeeRateDistributorOption[],
      rows: [
        {
          id: "FEE-FALLBACK",
          domainId: undefined,
          distributorId: undefined,
          subDistributorId: undefined,
          vendorName: user.companyName,
          domainName: "도메인",
          totalRate: feeRate,
          companyName: "본사",
          companyRate: feeRate,
          topDistributor: user.nickname,
          topDistributorRate: 0,
          distributor: "-",
          distributorRate: 0,
          subDistributor: "-",
          subDistributorRate: 0,
          updatedAt: "local",
        },
      ],
    };
  }

  await ensureFeeRateSchema();

  const scope = await getScopedDataCondition(user, {
    company: "dom",
    distributor: "dist",
    distributorAdmin: "dist_admin",
  });
  const distributorScope = getScopedDistributorCondition(user);

  const result = await query<FeeRateDbRow>(
    `
      select
        dom.id::text as id,
        dom.id::text as domain_id,
        dist.id::text as distributor_id,
        coalesce(parent_dist.id, dist.id)::text as top_distributor_id,
        fr.sub_distributor_id::text as sub_distributor_id,
        case
          when dist.id is null then '-'
          when parent_dist.id is null then null
          else dist.name
        end as distributor_name,
        child_dist.names as child_distributor_names,
        coalesce(sub_dist.name, '-') as sub_distributor_name,
        case
          when dist.id is null then '-'
          when parent_dist.id is null then dist.name
          else parent_dist.name
        end as top_distributor_name,
        dom.domain_name,
        c.company_name,
        coalesce(domain_admin.name, c.company_name) as vendor_name,
        coalesce(fr.company_rate, 0.2)::text as company_rate,
        coalesce(fr.distributor_rate, 0.1)::text as distributor_rate,
        coalesce(
          fr.agency_rate,
          case when parent_dist.id is null and child_dist.names is null then 0 else 0.1 end
        )::text as agency_rate,
        coalesce(fr.sub_distributor_rate, 0)::text as sub_distributor_rate,
        coalesce(fr.updated_at, dom.updated_at, dist.updated_at) as updated_at
      from domains dom
      join companies c on c.id = dom.company_id
      left join distributors dist on dist.id = dom.distributor_id
      left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
      left join admins dist_admin on dist_admin.id = dist.admin_id
      left join lateral (
        select string_agg(child.name, ', ' order by child.name) as names
        from distributors child
        where child.parent_distributor_id = dist.id
          and child.status = 'ACTIVE'
      ) child_dist on parent_dist.id is null
      left join lateral (
        select a.name
        from admin_domain_mappings adm
        join admins a on a.id = adm.admin_id
        where adm.domain_id = dom.id
          and a.role = 'DOMAIN_ADMIN'
          and a.status <> 'DELETED'
        order by a.created_at desc
        limit 1
      ) domain_admin on true
      left join lateral (
        select *
        from fee_rates fee
        where fee.starts_at <= now()
          and (fee.ends_at is null or fee.ends_at > now())
          and fee.domain_id = dom.id
        order by
          fee.starts_at desc,
          fee.created_at desc
        limit 1
      ) fr on true
      left join distributors sub_dist
        on sub_dist.id = fr.sub_distributor_id
        and sub_dist.status = 'ACTIVE'
      where dom.status <> 'DELETED'
        and (dist.id is null or dist.status = 'ACTIVE')
        and domain_admin.name is not null
        ${scope.sql}
      order by dom.created_at desc
    `,
    scope.values,
  );

  const optionResult = await query<FeeRateDistributorOption>(
    `
      select
        dist.id::text as id,
        dist.name,
        dist.parent_distributor_id::text as "parentDistributorId",
        case
          when dist.parent_distributor_id is null then 'TOP_DISTRIBUTOR'
          else 'DISTRIBUTOR'
        end as role
      from distributors dist
      left join admins dist_admin on dist_admin.id = dist.admin_id
      where dist.status = 'ACTIVE'
        ${distributorScope.sql}
      order by
        case when dist.parent_distributor_id is null then 0 else 1 end,
        dist.name asc
    `,
    distributorScope.values,
  );

  const rows = result.rows.map(toSettingsRow);

  return {
    companyName: "도메인",
    feeRate: rows[0]?.totalRate ?? 0.4,
    rows,
    distributorOptions: optionResult.rows,
  };
}

export async function updateFeeRateDomainDistributor(input: {
  user: SessionUser;
  domainId?: string;
  distributorId?: string;
  target?: "topDistributor" | "distributor" | "subDistributor";
}) {
  if (!hasDatabaseUrl()) {
    return;
  }

  if (!input.domainId || !input.distributorId) {
    throw new Error("변경할 도메인과 총판 정보를 확인해주세요.");
  }

  await withTransaction(async (client) => {
    await ensureFeeRateSchema(client);

    const distributorResult = await client.query<{ id: string }>(
      `
        select id::text
        from distributors dist
        left join admins dist_admin on dist_admin.id = dist.admin_id
        where dist.id = $1::uuid
          and dist.status = 'ACTIVE'
          and dist_admin.created_by = $2::uuid
        limit 1
      `,
      [input.distributorId, input.user.id],
    );

    if (!distributorResult.rows[0]) {
      throw new Error("선택한 총판 정보를 찾을 수 없습니다.");
    }

    if (input.target === "subDistributor") {
      const domainResult = await client.query<{
        company_id: string;
        distributor_id: string | null;
        fee_id: string | null;
      }>(
        `
          select
            dom.company_id::text,
            dom.distributor_id::text,
            (
              select fee.id::text
              from fee_rates fee
              where fee.domain_id = dom.id
                and fee.starts_at <= now()
                and (fee.ends_at is null or fee.ends_at > now())
              order by fee.starts_at desc, fee.created_at desc
              limit 1
            ) as fee_id
          from domains dom
          where dom.id = $1::uuid
            and dom.status <> 'DELETED'
            and ${getMasterOwnedCompanyExistsCondition("dom.company_id", "$2")}
          limit 1
        `,
        [input.domainId, input.user.id],
      );
      const domain = domainResult.rows[0];

      if (!domain?.company_id) {
        throw new Error("변경할 도메인을 찾을 수 없습니다.");
      }

      if (domain.fee_id) {
        await client.query(
          `
            update fee_rates
            set sub_distributor_id = $2::uuid, updated_at = now()
            where id = $1::uuid
          `,
          [domain.fee_id, input.distributorId],
        );
        return;
      }

      await client.query(
        `
          insert into fee_rates (
            company_id,
            domain_id,
            distributor_id,
            sub_distributor_id,
            company_rate,
            distributor_rate,
            agency_rate,
            sub_distributor_rate,
            starts_at
          )
          values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 0.2, 0.1, 0.1, 0, now())
        `,
        [
          domain.company_id,
          input.domainId,
          domain.distributor_id,
          input.distributorId,
        ],
      );
      return;
    }

    const domainResult = await client.query<{ id: string }>(
      `
        update domains
        set distributor_id = $2::uuid, updated_at = now()
        where id = $1::uuid
          and status <> 'DELETED'
          and ${getMasterOwnedCompanyExistsCondition("domains.company_id", "$3")}
        returning id::text
      `,
      [input.domainId, input.distributorId, input.user.id],
    );

    if (!domainResult.rows[0]) {
      throw new Error("변경할 도메인을 찾을 수 없습니다.");
    }

    await client.query(
      `
          update fee_rates
          set distributor_id = $2::uuid, updated_at = now()
        where domain_id = $1::uuid
          and starts_at <= now()
          and (ends_at is null or ends_at > now())
      `,
      [input.domainId, input.distributorId],
    );
  });
}

export async function saveFeeRateSettings(input: {
  user: SessionUser;
  domainId?: string;
  distributorId?: string;
  companyRate: number;
  topDistributorRate: number;
  distributorRate: number;
  subDistributorRate: number;
}) {
  if (!hasDatabaseUrl()) {
    return;
  }

  if (!input.domainId) {
    throw new Error("수수료 적용 도메인을 찾을 수 없습니다.");
  }

  await withTransaction(async (client) => {
    await ensureFeeRateSchema(client);

    const domainResult = await client.query<{
      company_id: string;
      distributor_id: string | null;
      domain_id: string | null;
      fee_id: string | null;
      sub_distributor_id: string | null;
    }>(
      `
        select
          dom.company_id::text,
          dom.distributor_id::text,
          dom.id::text as domain_id,
          (
            select fee.id::text
            from fee_rates fee
            where fee.domain_id = dom.id
              and fee.starts_at <= now()
              and (fee.ends_at is null or fee.ends_at > now())
            order by fee.starts_at desc, fee.created_at desc
            limit 1
          ) as fee_id,
          (
            select fee.sub_distributor_id::text
            from fee_rates fee
            where fee.domain_id = dom.id
              and fee.starts_at <= now()
              and (fee.ends_at is null or fee.ends_at > now())
            order by fee.starts_at desc, fee.created_at desc
            limit 1
          ) as sub_distributor_id
        from domains dom
        where dom.id = $1::uuid
          and dom.status <> 'DELETED'
          and ${getMasterOwnedCompanyExistsCondition("dom.company_id", "$2")}
        limit 1
        for update
      `,
      [input.domainId, input.user.id],
    );

    const target = domainResult.rows[0];

    if (!target?.company_id) {
      throw new Error("수수료 적용 도메인을 찾을 수 없습니다.");
    }

    if (target.fee_id) {
      await client.query(
        `
          update fee_rates
          set ends_at = now(), updated_at = now()
          where id = $1::uuid
            and ends_at is null
        `,
        [target.fee_id],
      );
    }

    await client.query(
      `
        insert into fee_rates (
          company_id,
          domain_id,
          distributor_id,
          sub_distributor_id,
          company_rate,
          distributor_rate,
          agency_rate,
          sub_distributor_rate,
          starts_at,
          created_by
        )
        values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, now(), $9::uuid)
      `,
      [
        target.company_id,
        input.domainId,
        target.distributor_id,
        target.sub_distributor_id,
        input.companyRate,
        input.topDistributorRate,
        input.distributorRate,
        input.subDistributorRate,
        input.user.id,
      ],
    );
  });
}

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

type FeePartner = {
  position: 1 | 2 | 3;
  distributorId: string | null;
  rate: number;
};

type DistributorLookupRow = {
  id: string;
  parent_distributor_id: string | null;
};

type TransactionClient = {
  query<T = unknown>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
};

function getTargetPosition(
  target?: "topDistributor" | "distributor" | "subDistributor",
): 1 | 2 | 3 {
  if (target === "distributor") {
    return 2;
  }

  if (target === "subDistributor") {
    return 3;
  }

  return 1;
}

type FeeRateDbRow = {
  id: string;
  domain_id: string | null;
  distributor_id: string | null;
  top_distributor_id: string | null;
  sub_distributor_id: string | null;
  partner1_id: string | null;
  partner2_id: string | null;
  partner3_id: string | null;
  distributor_name: string | null;
  child_distributor_names: string | null;
  top_distributor_name: string | null;
  sub_distributor_name: string | null;
  partner1_name: string | null;
  partner2_name: string | null;
  partner3_name: string | null;
  domain_name: string | null;
  company_name: string | null;
  vendor_name: string | null;
  company_rate: string;
  distributor_rate: string;
  agency_rate: string;
  sub_distributor_rate: string;
  partner1_rate: string | null;
  partner2_rate: string | null;
  partner3_rate: string | null;
  updated_at: Date | string;
};

function formatStamp(value: Date | string) {
  return formatKoreanDateTime(value);
}

function getTotalRate(
  row: Pick<
    FeeRateDbRow,
    | "company_rate"
    | "distributor_rate"
    | "agency_rate"
    | "sub_distributor_rate"
    | "partner1_rate"
    | "partner2_rate"
    | "partner3_rate"
  >,
) {
  return (
    Number(row.company_rate) +
    Number(row.partner1_rate ?? row.distributor_rate) +
    Number(row.partner2_rate ?? row.agency_rate) +
    Number(row.partner3_rate ?? row.sub_distributor_rate)
  );
}

function toSettingsRow(row: FeeRateDbRow): FeeRateSettingsRow {
  const hasPartnerRows = Boolean(
    row.partner1_id || row.partner2_id || row.partner3_id,
  );

  return {
    id: row.id,
    domainId: row.domain_id ?? undefined,
    distributorId: hasPartnerRows
      ? (row.partner2_id ?? undefined)
      : (row.distributor_id ?? undefined),
    topDistributorId: hasPartnerRows
      ? (row.partner1_id ?? undefined)
      : (row.top_distributor_id ?? undefined),
    subDistributorId: hasPartnerRows
      ? (row.partner3_id ?? undefined)
      : (row.sub_distributor_id ?? undefined),
    vendorName: row.vendor_name ?? row.company_name ?? "-",
    domainName: row.domain_name ?? "-",
    totalRate: Number(getTotalRate(row).toFixed(2)),
    companyName: "본사",
    companyRate: Number(row.company_rate),
    topDistributor: hasPartnerRows
      ? (row.partner1_name ?? "-")
      : (row.top_distributor_name ?? "-"),
    topDistributorRate: Number(row.partner1_rate ?? row.distributor_rate),
    distributor: hasPartnerRows
      ? (row.partner2_name ?? "-")
      : (row.distributor_name ?? row.child_distributor_names ?? "-"),
    distributorRate: Number(row.partner2_rate ?? row.agency_rate),
    subDistributor: hasPartnerRows
      ? (row.partner3_name ?? "-")
      : (row.sub_distributor_name ?? "-"),
    subDistributorRate: Number(row.partner3_rate ?? row.sub_distributor_rate),
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
        partner_rows.partner1_id,
        partner_rows.partner2_id,
        partner_rows.partner3_id,
        case
          when dist.id is null then '-'
          when parent_dist.id is null then null
          else dist.name
        end as distributor_name,
        child_dist.names as child_distributor_names,
        coalesce(sub_dist.name, '-') as sub_distributor_name,
        partner_rows.partner1_name,
        partner_rows.partner2_name,
        partner_rows.partner3_name,
        case
          when dist.id is null then '-'
          when parent_dist.id is null then dist.name
          else parent_dist.name
        end as top_distributor_name,
        dom.domain_name,
        c.company_name,
        coalesce(domain_admin.name, c.company_name) as vendor_name,
        coalesce(fr.company_rate, 0.2)::text as company_rate,
        case
          when dist.id is null then 0
          else coalesce(fr.distributor_rate, 0.1)
        end::text as distributor_rate,
        case
          when dist.id is null then 0
          when parent_dist.id is null and child_dist.names is null then 0
          else coalesce(fr.agency_rate, 0.1)
        end::text as agency_rate,
        case
          when fr.sub_distributor_id is null then 0
          else coalesce(fr.sub_distributor_rate, 0)
        end::text as sub_distributor_rate,
        partner_rows.partner1_rate,
        partner_rows.partner2_rate,
        partner_rows.partner3_rate,
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
      left join lateral (
        select
          max(case when fp.position = 1 then fp.distributor_id::text end) as partner1_id,
          max(case when fp.position = 2 then fp.distributor_id::text end) as partner2_id,
          max(case when fp.position = 3 then fp.distributor_id::text end) as partner3_id,
          max(case when fp.position = 1 then partner_dist.name end) as partner1_name,
          max(case when fp.position = 2 then partner_dist.name end) as partner2_name,
          max(case when fp.position = 3 then partner_dist.name end) as partner3_name,
          max(case when fp.position = 1 then fp.rate::text end) as partner1_rate,
          max(case when fp.position = 2 then fp.rate::text end) as partner2_rate,
          max(case when fp.position = 3 then fp.rate::text end) as partner3_rate
        from fee_rate_partners fp
        join distributors partner_dist on partner_dist.id = fp.distributor_id
        where fp.fee_rate_id = fr.id
          and partner_dist.status = 'ACTIVE'
      ) partner_rows on true
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

async function getCurrentFeePartners(
  client: TransactionClient,
  feeId: string | null,
  legacy: {
    topDistributorId: string | null;
    distributorId: string | null;
    subDistributorId: string | null;
    topDistributorRate: number;
    distributorRate: number;
    subDistributorRate: number;
  },
) {
  if (feeId) {
    const partnerResult = await client.query<{
      position: number;
      distributor_id: string;
      rate: string;
    }>(
      `
        select position, distributor_id::text, rate::text
        from fee_rate_partners
        where fee_rate_id = $1::uuid
        order by position asc
      `,
      [feeId],
    );

    if (partnerResult.rows.length) {
      return ([1, 2, 3] as const).map((position) => {
        const row = partnerResult.rows.find(
          (candidate) => candidate.position === position,
        );

        return {
          position,
          distributorId: row?.distributor_id ?? null,
          rate: Number(row?.rate ?? 0),
        };
      });
    }
  }

  return [
    {
      position: 1,
      distributorId: legacy.topDistributorId,
      rate: legacy.topDistributorRate,
    },
    {
      position: 2,
      distributorId: legacy.distributorId,
      rate: legacy.distributorRate,
    },
    {
      position: 3,
      distributorId: legacy.subDistributorId,
      rate: legacy.subDistributorRate,
    },
  ] satisfies FeePartner[];
}

async function normalizeFeePartners(
  client: TransactionClient,
  partners: FeePartner[],
  changedPosition?: 1 | 2 | 3,
) {
  const nextPartners = partners.map((partner) => ({ ...partner }));
  const selectedPartner = changedPosition
    ? nextPartners.find((partner) => partner.position === changedPosition)
    : undefined;

  if (!selectedPartner?.distributorId) {
    return nextPartners;
  }

  const selectedResult = await client.query<DistributorLookupRow>(
    `
      select id::text, parent_distributor_id::text
      from distributors
      where id = $1::uuid
        and status = 'ACTIVE'
      limit 1
    `,
    [selectedPartner.distributorId],
  );
  const selected = selectedResult.rows[0];

  if (!selected) {
    return nextPartners;
  }

  if (selected.parent_distributor_id) {
    const previous = nextPartners.find(
      (partner) => partner.position === Math.max(1, selectedPartner.position - 1),
    );

    if (selectedPartner.position === 1) {
      const second = nextPartners.find((partner) => partner.position === 2);
      selectedPartner.distributorId = selected.parent_distributor_id;
      if (second && !second.distributorId) {
        second.distributorId = selected.id;
      }
    } else if (previous && !previous.distributorId) {
      previous.distributorId = selected.parent_distributor_id;
    }

    return nextPartners;
  }

  const next = nextPartners.find(
    (partner) => partner.position === selectedPartner.position + 1,
  );

  if (next && !next.distributorId) {
    const childResult = await client.query<{ id: string }>(
      `
        select id::text
        from distributors
        where parent_distributor_id = $1::uuid
          and status = 'ACTIVE'
        order by created_at asc, name asc
        limit 1
      `,
      [selected.id],
    );

    next.distributorId = childResult.rows[0]?.id ?? next.distributorId;
  }

  return nextPartners;
}

async function insertFeeRatePartners(
  client: TransactionClient,
  feeRateId: string,
  partners: FeePartner[],
) {
  const distributorIds = partners
    .map((partner) => partner.distributorId)
    .filter((id): id is string => Boolean(id));
  const uniqueDistributorIds = new Set(distributorIds);

  if (uniqueDistributorIds.size !== distributorIds.length) {
    throw new Error("같은 총판은 수수료 칸에 중복으로 설정할 수 없습니다.");
  }

  for (const partner of partners) {
    if (!partner.distributorId) {
      continue;
    }

    await client.query(
      `
        insert into fee_rate_partners (
          fee_rate_id,
          position,
          distributor_id,
          rate
        )
        values ($1::uuid, $2, $3::uuid, $4)
      `,
      [feeRateId, partner.position, partner.distributorId, partner.rate],
    );
  }
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
        select dist.id::text
        from distributors dist
        where dist.id = $1::uuid
          and dist.status = 'ACTIVE'
          and ${getMasterOwnedCompanyExistsCondition("dist.company_id", "$2")}
        limit 1
      `,
      [input.distributorId, input.user.id],
    );

    if (!distributorResult.rows[0]) {
      throw new Error("선택한 총판 정보를 찾을 수 없습니다.");
    }

    const domainResult = await client.query<{
      id: string;
      company_id: string;
      distributor_id: string | null;
      top_distributor_id: string | null;
      sub_distributor_id: string | null;
      fee_id: string | null;
      company_rate: string | null;
      distributor_rate: string | null;
      agency_rate: string | null;
      sub_distributor_rate: string | null;
    }>(
      `
        select
          dom.id::text,
          dom.company_id::text,
          dom.distributor_id::text,
          coalesce(parent_dist.id, dist.id)::text as top_distributor_id,
          fee.sub_distributor_id::text as sub_distributor_id,
          fee.id::text as fee_id,
          fee.company_rate::text,
          fee.distributor_rate::text,
          fee.agency_rate::text,
          fee.sub_distributor_rate::text
        from domains dom
        left join distributors dist on dist.id = dom.distributor_id
        left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
        left join lateral (
          select *
          from fee_rates fee
          where fee.domain_id = dom.id
            and fee.starts_at <= now()
            and (fee.ends_at is null or fee.ends_at > now())
          order by fee.starts_at desc, fee.created_at desc
          limit 1
        ) fee on true
        where dom.id = $1::uuid
          and dom.status <> 'DELETED'
          and ${getMasterOwnedCompanyExistsCondition("dom.company_id", "$2")}
        limit 1
        for update
      `,
      [input.domainId, input.user.id],
    );
    const domain = domainResult.rows[0];

    if (!domain) {
      throw new Error("변경할 도메인을 찾을 수 없습니다.");
    }

    const targetPosition = getTargetPosition(input.target);
    const currentPartners = await getCurrentFeePartners(
      client,
      domain.fee_id,
      {
        topDistributorId: domain.top_distributor_id,
        distributorId:
          domain.distributor_id && domain.distributor_id !== domain.top_distributor_id
            ? domain.distributor_id
            : null,
        subDistributorId: domain.sub_distributor_id,
        topDistributorRate: Number(domain.distributor_rate ?? 0.1),
        distributorRate: Number(domain.agency_rate ?? 0.1),
        subDistributorRate: Number(domain.sub_distributor_rate ?? 0),
      },
    );
    const nextPartners = await normalizeFeePartners(
      client,
      currentPartners.map((partner) =>
        partner.position === targetPosition
          ? { ...partner, distributorId: input.distributorId ?? null }
          : partner,
      ),
      targetPosition,
    );

    if (domain.fee_id) {
      await client.query(
        `
          update fee_rates
          set ends_at = now(), updated_at = now()
          where id = $1::uuid
            and ends_at is null
        `,
        [domain.fee_id],
      );
    }

    const insertedFee = await client.query<{ id: string }>(
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
        returning id::text
      `,
      [
        domain.company_id,
        input.domainId,
        nextPartners[1]?.distributorId ?? nextPartners[0]?.distributorId,
        nextPartners[2]?.distributorId,
        Number(domain.company_rate ?? 0.2),
        nextPartners[0]?.rate ?? Number(domain.distributor_rate ?? 0.1),
        nextPartners[1]?.rate ?? Number(domain.agency_rate ?? 0.1),
        nextPartners[2]?.rate ?? Number(domain.sub_distributor_rate ?? 0),
        input.user.id,
      ],
    );

    await insertFeeRatePartners(client, insertedFee.rows[0].id, nextPartners);
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
      top_distributor_id: string | null;
      domain_id: string | null;
      fee_id: string | null;
      sub_distributor_id: string | null;
    }>(
      `
        select
          dom.company_id::text,
          dom.distributor_id::text,
          coalesce(parent_dist.id, dist.id)::text as top_distributor_id,
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
        left join distributors dist on dist.id = dom.distributor_id
        left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
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

    const currentPartners = await getCurrentFeePartners(
      client,
      target.fee_id,
      {
        topDistributorId: target.top_distributor_id,
        distributorId:
          target.distributor_id && target.distributor_id !== target.top_distributor_id
            ? target.distributor_id
            : null,
        subDistributorId: target.sub_distributor_id,
        topDistributorRate: input.topDistributorRate,
        distributorRate: input.distributorRate,
        subDistributorRate: input.subDistributorRate,
      },
    );
    const nextPartners = currentPartners.map((partner) => {
      if (partner.position === 1) {
        return { ...partner, rate: input.topDistributorRate };
      }

      if (partner.position === 2) {
        return { ...partner, rate: input.distributorRate };
      }

      return { ...partner, rate: input.subDistributorRate };
    });

    const insertedFee = await client.query<{ id: string }>(
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
        returning id::text
      `,
      [
        target.company_id,
        input.domainId,
        nextPartners[1]?.distributorId ?? nextPartners[0]?.distributorId,
        nextPartners[2]?.distributorId,
        input.companyRate,
        input.topDistributorRate,
        input.distributorRate,
        input.subDistributorRate,
        input.user.id,
      ],
    );

    await insertFeeRatePartners(client, insertedFee.rows[0].id, nextPartners);
  });
}

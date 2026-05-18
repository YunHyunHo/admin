import { getFeeRateByCompanyFromSettings } from "@/lib/charge-utils";
import { hasDatabaseUrl, query, withTransaction } from "@/lib/db";
import { formatKoreanDateTime } from "@/lib/korean-time";
import { getScopedDistributorCondition } from "@/lib/master-scope";
import {
  getAdminSettingsFromCookie,
} from "@/lib/settings-cookie";
import type { SessionUser } from "@/lib/auth";

export type FeeRateSettingsRow = {
  id: string;
  distributorId?: string;
  domainName: string;
  totalRate: number;
  topDistributor: string;
  topDistributorRate: number;
  distributor: string;
  distributorRate: number;
  updatedAt: string;
};

type FeeRateDbRow = {
  id: string;
  distributor_id: string | null;
  distributor_name: string | null;
  master_name: string | null;
  domain_name: string | null;
  company_name: string | null;
  company_rate: string;
  distributor_rate: string;
  agency_rate: string;
  updated_at: Date | string;
};

function formatStamp(value: Date | string) {
  return formatKoreanDateTime(value);
}

function getTotalRate(row: Pick<FeeRateDbRow, "company_rate" | "distributor_rate" | "agency_rate">) {
  return Number(row.company_rate) + Number(row.distributor_rate) + Number(row.agency_rate);
}

function toSettingsRow(row: FeeRateDbRow): FeeRateSettingsRow {
  return {
    id: row.id,
    distributorId: row.distributor_id ?? undefined,
    domainName: row.distributor_name ?? "하부계정 없음",
    totalRate: Number(getTotalRate(row).toFixed(2)),
    topDistributor: row.master_name ?? "마스터 관리자",
    topDistributorRate: Number(row.company_rate),
    distributor: row.distributor_name ?? "하부계정 없음",
    distributorRate: Number(row.distributor_rate),
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
      rows: [
        {
          id: "FEE-FALLBACK",
          domainName: "하부계정",
          totalRate: feeRate,
          topDistributor: user.nickname,
          topDistributorRate: feeRate,
          distributor: "하부계정",
          distributorRate: 0,
          updatedAt: "local",
        },
      ],
    };
  }
  const scope = getScopedDistributorCondition(user);

  const result = await query<FeeRateDbRow>(
    `
      select
        coalesce(fr.id::text, dist.id::text) as id,
        dist.id::text as distributor_id,
        dist.name as distributor_name,
        owner_master.name as master_name,
        null::text as domain_name,
        c.company_name,
        coalesce(fr.company_rate, 0.4)::text as company_rate,
        coalesce(fr.distributor_rate, 0)::text as distributor_rate,
        coalesce(fr.agency_rate, 0)::text as agency_rate,
        coalesce(fr.updated_at, dist.updated_at) as updated_at
      from distributors dist
      join companies c on c.id = dist.company_id
      left join admins dist_admin on dist_admin.id = dist.admin_id
      left join admins owner_master on owner_master.id = dist_admin.created_by
      left join lateral (
        select *
        from fee_rates fee
        where
          fee.starts_at <= now()
          and (fee.ends_at is null or fee.ends_at > now())
          and (
            fee.distributor_id = dist.id
            or (
              fee.distributor_id is null
              and fee.domain_id is null
              and fee.company_id = dist.company_id
            )
          )
        order by
          case when fee.distributor_id = dist.id then 0 else 1 end,
          fee.starts_at desc,
          fee.created_at desc
        limit 1
      ) fr on true
      where dist.status = 'ACTIVE'
        ${scope.sql}
      order by dist.created_at desc
    `,
    scope.values,
  );
  const rows = result.rows.map(toSettingsRow);
  const fallbackRows =
    rows.length > 0
      ? rows
      : [
          {
            id: "FEE-DEFAULT",
            domainName: "하부계정 없음",
            totalRate: 0.4,
            topDistributor: user.nickname,
            topDistributorRate: 0.4,
            distributor: "하부계정 없음",
            distributorRate: 0,
            updatedAt: "미설정",
          },
        ];

  return {
    companyName: "총판",
    feeRate: fallbackRows[0]?.totalRate ?? 0.4,
    rows: fallbackRows,
  };
}

export async function saveFeeRateSettings(input: {
  user: SessionUser;
  targetId?: string;
  distributorId?: string;
  totalRate: number;
  topDistributorRate: number;
  distributorRate: number;
}) {
  if (!hasDatabaseUrl()) {
    return;
  }

  await withTransaction(async (client) => {
    const currentResult = input.distributorId
      ? await client.query<{
          id: string;
          company_id: string | null;
          domain_id: string | null;
          distributor_id: string | null;
        }>(
          `
            select
              fee.id::text,
              fee.company_id::text,
              fee.domain_id::text,
              fee.distributor_id::text
            from fee_rates fee
            join distributors dist on dist.id = fee.distributor_id
            left join admins dist_admin on dist_admin.id = dist.admin_id
            where
              fee.distributor_id = $1::uuid
              and ${input.user.role === "MASTER" ? "dist_admin.created_by = $2::uuid" : "dist.admin_id = $2::uuid"}
              and fee.starts_at <= now()
              and (fee.ends_at is null or fee.ends_at > now())
            order by fee.starts_at desc, fee.created_at desc
            limit 1
            for update
          `,
          [input.distributorId, input.user.id],
        )
      : await client.query<{
          id: string;
          company_id: string | null;
          domain_id: string | null;
          distributor_id: string | null;
        }>(
          `
            select id::text, company_id::text, domain_id::text, distributor_id::text
            from fee_rates
            where created_by = $1::uuid and starts_at <= now() and (ends_at is null or ends_at > now())
            order by starts_at desc, created_at desc
            limit 1
            for update
          `,
          [input.user.id],
        );
    const current = currentResult.rows[0];
    let companyId = current?.company_id ?? null;
    const domainId = current?.domain_id ?? null;
    const distributorId = input.distributorId ?? current?.distributor_id ?? null;

    if (distributorId && !companyId) {
      const distributorResult = await client.query<{ company_id: string }>(
        `
          select company_id::text
          from distributors
          left join admins dist_admin on dist_admin.id = distributors.admin_id
          where distributors.id = $1::uuid
            and ${input.user.role === "MASTER" ? "dist_admin.created_by = $2::uuid" : "distributors.admin_id = $2::uuid"}
        `,
        [distributorId, input.user.id],
      );

      companyId = distributorResult.rows[0]?.company_id ?? null;
    }

    if (!companyId && !current) {
      const companyResult = await client.query<{ id: string }>(
        `
          insert into companies (company_name, status)
          values ('전체', 'ACTIVE')
          on conflict (company_name) do update
          set status = 'ACTIVE', updated_at = now()
          returning id::text
        `,
      );

      companyId = companyResult.rows[0]?.id ?? null;
    }

    if (!companyId && !domainId && !distributorId) {
      throw new Error("수수료 적용 범위를 찾을 수 없습니다.");
    }

    if (current) {
      await client.query(
        `
          update fee_rates
          set ends_at = now(), updated_at = now()
          where id = $1::uuid and ends_at is null
        `,
        [current.id],
      );
    }

    await client.query(
      `
        insert into fee_rates (
          company_id,
          domain_id,
          distributor_id,
          company_rate,
          distributor_rate,
          agency_rate,
          starts_at,
          created_by
        )
        values ($1::uuid, $2::uuid, $3::uuid, $4, $5, 0, now(), $6::uuid)
      `,
      [
        companyId,
        domainId,
        distributorId,
        input.topDistributorRate,
        input.distributorRate,
        input.user.id,
      ],
    );
  });
}

import { getFeeRateByCompanyFromSettings } from "@/lib/charge-utils";
import { hasDatabaseUrl, query, withTransaction } from "@/lib/db";
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
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${month}-${day} ${hours}:${minutes}:${seconds}`;
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

  const result = await query<FeeRateDbRow>(
    `
      select
        coalesce(fr.id::text, dist.id::text) as id,
        dist.id::text as distributor_id,
        dist.name as distributor_name,
        master.name as master_name,
        null::text as domain_name,
        c.company_name,
        coalesce(fr.company_rate, 0.4)::text as company_rate,
        coalesce(fr.distributor_rate, 0)::text as distributor_rate,
        coalesce(fr.agency_rate, 0)::text as agency_rate,
        coalesce(fr.updated_at, dist.updated_at) as updated_at
      from distributors dist
      join companies c on c.id = dist.company_id
      left join admins master on master.role = 'MASTER' and master.status = 'ACTIVE'
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
      order by dist.created_at desc
    `,
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
            topDistributor: "마스터 관리자",
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
            select id::text, company_id::text, domain_id::text, distributor_id::text
            from fee_rates
            where
              distributor_id = $1::uuid
              and starts_at <= now()
              and (ends_at is null or ends_at > now())
            order by starts_at desc, created_at desc
            limit 1
            for update
          `,
          [input.distributorId],
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
            where starts_at <= now() and (ends_at is null or ends_at > now())
            order by starts_at desc, created_at desc
            limit 1
            for update
          `,
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
          where id = $1::uuid
        `,
        [distributorId],
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

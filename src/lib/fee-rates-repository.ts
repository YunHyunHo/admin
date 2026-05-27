import { getFeeRateByCompanyFromSettings } from "@/lib/charge-utils";
import { hasDatabaseUrl, query, withTransaction } from "@/lib/db";
import { formatKoreanDateTime } from "@/lib/korean-time";
import { getScopedDistributorCondition } from "@/lib/master-scope";
import { getAdminSettingsFromCookie } from "@/lib/settings-cookie";
import type { SessionUser } from "@/lib/auth";

export type FeeRateSettingsRow = {
  id: string;
  domainId?: string;
  distributorId?: string;
  companyId?: string;
  vendorName: string;
  domainName: string;
  totalRate: number;
  companyName: string;
  companyRate: number;
  topDistributor: string;
  topDistributorRate: number;
  distributor: string;
  distributorRate: number;
  updatedAt: string;
};

type FeeRateDbRow = {
  id: string;
  domain_id: string | null;
  distributor_id: string | null;
  company_id: string | null;
  distributor_name: string | null;
  top_distributor_name: string | null;
  domain_name: string | null;
  company_name: string | null;
  vendor_name: string | null;
  company_rate: string;
  distributor_rate: string;
  agency_rate: string;
  updated_at: Date | string;
};

function formatStamp(value: Date | string) {
  return formatKoreanDateTime(value);
}

function getTotalRate(
  row: Pick<FeeRateDbRow, "company_rate" | "distributor_rate" | "agency_rate">,
) {
  return (
    Number(row.company_rate) +
    Number(row.distributor_rate) +
    Number(row.agency_rate)
  );
}

function toSettingsRow(row: FeeRateDbRow): FeeRateSettingsRow {
  return {
    id: row.id,
    domainId: row.domain_id ?? undefined,
    distributorId: row.distributor_id ?? undefined,
    companyId: row.company_id ?? undefined,
    vendorName: row.vendor_name ?? row.company_name ?? "-",
    domainName: row.domain_name ?? "-",
    totalRate: Number(getTotalRate(row).toFixed(2)),
    companyName: "본사",
    companyRate: Number(row.company_rate),
    topDistributor: row.top_distributor_name ?? "-",
    topDistributorRate: Number(row.distributor_rate),
    distributor: row.distributor_name ?? "-",
    distributorRate: Number(row.agency_rate),
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
          domainId: undefined,
          distributorId: undefined,
          companyId: undefined,
          vendorName: user.companyName,
          domainName: "도메인",
          totalRate: feeRate,
          companyName: "본사",
          companyRate: feeRate,
          topDistributor: user.nickname,
          topDistributorRate: 0,
          distributor: "-",
          distributorRate: 0,
          updatedAt: "local",
        },
      ],
    };
  }

  if (user.role === "MASTER") {
    const result = await query<FeeRateDbRow>(
      `
        with admin_rows as (
          select
            a.id::text as id,
            null::text as domain_id,
            dist.id::text as distributor_id,
            c.id::text as company_id,
            case
              when a.role = 'TOP_DISTRIBUTOR' then a.name
              when a.role = 'ADMIN' then a.name
              else c.company_name
            end as vendor_name,
            '-'::text as domain_name,
            c.company_name,
            case
              when a.role = 'TOP_DISTRIBUTOR' then a.name
              when a.role = 'ADMIN' then coalesce(parent_dist.name, '-')
              else '-'
            end as top_distributor_name,
            case
              when a.role = 'ADMIN' then a.name
              else '-'
            end as distributor_name,
            coalesce(fr.company_rate, 0.2)::text as company_rate,
            coalesce(fr.distributor_rate, 0.1)::text as distributor_rate,
            coalesce(fr.agency_rate, case when a.role = 'ADMIN' then 0.1 else 0 end)::text as agency_rate,
            coalesce(fr.updated_at, a.updated_at, dist.updated_at) as updated_at
          from admins a
          left join distributors dist on dist.admin_id = a.id and dist.status = 'ACTIVE'
          left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
          left join companies c on c.id = dist.company_id
          left join lateral (
            select *
            from fee_rates fee
            where fee.starts_at <= now()
              and (fee.ends_at is null or fee.ends_at > now())
              and fee.domain_id is null
              and fee.distributor_id = dist.id
            order by fee.starts_at desc, fee.created_at desc
            limit 1
          ) fr on true
          where a.status <> 'DELETED'
            and a.role in ('TOP_DISTRIBUTOR', 'ADMIN')
        ),
        vendor_rows as (
          select
            a.id::text as id,
            null::text as domain_id,
            null::text as distributor_id,
            c.id::text as company_id,
            a.name as vendor_name,
            '-'::text as domain_name,
            c.company_name,
            '-'::text as top_distributor_name,
            '-'::text as distributor_name,
            coalesce(fr.company_rate, 0.2)::text as company_rate,
            coalesce(fr.distributor_rate, 0)::text as distributor_rate,
            coalesce(fr.agency_rate, 0)::text as agency_rate,
            coalesce(fr.updated_at, a.updated_at) as updated_at
          from admins a
          join admin_company_mappings acm on acm.admin_id = a.id
          join companies c on c.id = acm.company_id
          left join admin_domain_mappings adm on adm.admin_id = a.id
          left join lateral (
            select *
            from fee_rates fee
            where fee.starts_at <= now()
              and (fee.ends_at is null or fee.ends_at > now())
              and fee.domain_id is null
              and fee.distributor_id is null
              and fee.company_id = c.id
            order by fee.starts_at desc, fee.created_at desc
            limit 1
          ) fr on true
          where a.status <> 'DELETED'
            and a.role = 'DOMAIN_ADMIN'
            and adm.admin_id is null
        ),
        domain_rows as (
          select
            dom.id::text as id,
            dom.id::text as domain_id,
            dist.id::text as distributor_id,
            c.id::text as company_id,
            coalesce(domain_admin.name, c.company_name) as vendor_name,
            dom.domain_name,
            c.company_name,
            case
              when dist.id is null then '-'
              when parent_dist.id is null then dist.name
              else parent_dist.name
            end as top_distributor_name,
            case
              when dist.id is null then '-'
              when parent_dist.id is null then '-'
              else dist.name
            end as distributor_name,
            coalesce(fr.company_rate, 0.2)::text as company_rate,
            coalesce(fr.distributor_rate, 0.1)::text as distributor_rate,
            coalesce(fr.agency_rate, case when parent_dist.id is null then 0 else 0.1 end)::text as agency_rate,
            coalesce(fr.updated_at, dom.updated_at, dist.updated_at) as updated_at
          from domains dom
          join companies c on c.id = dom.company_id
          left join distributors dist on dist.id = dom.distributor_id
          left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
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
            order by fee.starts_at desc, fee.created_at desc
            limit 1
          ) fr on true
          where dom.status <> 'DELETED'
        )
        select *
        from (
          select * from admin_rows
          union all
          select * from vendor_rows
          union all
          select * from domain_rows
        ) scoped_rows
        order by updated_at desc, vendor_name asc
      `,
    );

    const rows = result.rows.map(toSettingsRow);

    return {
      companyName: "도메인",
      feeRate: rows[0]?.totalRate ?? 0.4,
      rows,
    };
  }

  const scope = getScopedDistributorCondition(user);

  const result = await query<FeeRateDbRow>(
    `
      select
        dom.id::text as id,
        dom.id::text as domain_id,
        dist.id::text as distributor_id,
        case
          when dist.id is null then '-'
          when parent_dist.id is null then '-'
          else dist.name
        end as distributor_name,
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
        coalesce(fr.agency_rate, case when parent_dist.id is null then 0 else 0.1 end)::text as agency_rate,
        coalesce(fr.updated_at, dom.updated_at, dist.updated_at) as updated_at
      from domains dom
      join companies c on c.id = dom.company_id
      left join distributors dist on dist.id = dom.distributor_id
      left join distributors parent_dist on parent_dist.id = dist.parent_distributor_id
      left join admins dist_admin on dist_admin.id = dist.admin_id
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
      where dom.status <> 'DELETED'
        and dist.status = 'ACTIVE'
        ${scope.sql}
      order by dom.created_at desc
    `,
    scope.values,
  );

  const rows = result.rows.map(toSettingsRow);

  return {
    companyName: "도메인",
    feeRate: rows[0]?.totalRate ?? 0.4,
    rows,
  };
}

export async function saveFeeRateSettings(input: {
  user: SessionUser;
  domainId?: string;
  distributorId?: string;
  companyId?: string;
  companyRate: number;
  topDistributorRate: number;
  distributorRate: number;
}) {
  if (!hasDatabaseUrl()) {
    return;
  }

  await withTransaction(async (client) => {
    let target:
      | {
          company_id: string;
          distributor_id: string | null;
          domain_id: string | null;
          fee_id: string | null;
        }
      | undefined;

    if (input.domainId) {
      const domainResult = await client.query<{
        company_id: string;
        distributor_id: string | null;
        domain_id: string | null;
        fee_id: string | null;
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
            ) as fee_id
          from domains dom
          where dom.id = $1::uuid
            and dom.status <> 'DELETED'
          limit 1
          for update
        `,
        [input.domainId],
      );
      target = domainResult.rows[0];
    } else if (input.distributorId) {
      const distributorResult = await client.query<{
        company_id: string;
        distributor_id: string | null;
        domain_id: string | null;
        fee_id: string | null;
      }>(
        `
          select
            dist.company_id::text,
            dist.id::text as distributor_id,
            null::text as domain_id,
            (
              select fee.id::text
              from fee_rates fee
              where fee.domain_id is null
                and fee.distributor_id = dist.id
                and fee.starts_at <= now()
                and (fee.ends_at is null or fee.ends_at > now())
              order by fee.starts_at desc, fee.created_at desc
              limit 1
            ) as fee_id
          from distributors dist
          where dist.id = $1::uuid
            and dist.status = 'ACTIVE'
          limit 1
          for update
        `,
        [input.distributorId],
      );
      target = distributorResult.rows[0];
    } else if (input.companyId) {
      const companyResult = await client.query<{
        company_id: string;
        distributor_id: string | null;
        domain_id: string | null;
        fee_id: string | null;
      }>(
        `
          select
            c.id::text as company_id,
            null::text as distributor_id,
            null::text as domain_id,
            (
              select fee.id::text
              from fee_rates fee
              where fee.domain_id is null
                and fee.distributor_id is null
                and fee.company_id = c.id
                and fee.starts_at <= now()
                and (fee.ends_at is null or fee.ends_at > now())
              order by fee.starts_at desc, fee.created_at desc
              limit 1
            ) as fee_id
          from companies c
          where c.id = $1::uuid
            and c.status = 'ACTIVE'
          limit 1
          for update
        `,
        [input.companyId],
      );
      target = companyResult.rows[0];
    }

    if (!target?.company_id) {
      throw new Error("수수료 적용 대상을 찾을 수 없습니다.");
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
          company_rate,
          distributor_rate,
          agency_rate,
          starts_at,
          created_by
        )
        values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, now(), $7::uuid)
      `,
      [
        target.company_id,
        target.domain_id,
        target.distributor_id,
        input.companyRate,
        input.topDistributorRate,
        input.distributorRate,
        input.user.id,
      ],
    );
  });
}

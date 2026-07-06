import type { SessionUser } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { getMasterOwnedCompanyExistsCondition } from "@/lib/master-scope";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function permanentlyDeleteDomain(
  domainId: string,
  user: SessionUser,
) {
  if (!isUuid(domainId)) {
    throw new Error("도메인 정보를 확인해주세요.");
  }

  await withTransaction(async (client) => {
    const domainResult = await client.query<{
      company_id: string;
      company_name: string;
    }>(
      `
        select dom.company_id::text, c.company_name
        from domains dom
        join companies c on c.id = dom.company_id
        where dom.id = $1::uuid
          and ${getMasterOwnedCompanyExistsCondition("dom.company_id", "$2")}
        for update
      `,
      [domainId, user.id],
    );
    const domain = domainResult.rows[0];

    if (!domain) {
      throw new Error("완전 삭제할 도메인을 찾지 못했습니다.");
    }

    const adminResult = await client.query<{ id: string }>(
      `
        select distinct a.id::text
        from admins a
        left join admin_company_mappings acm on acm.admin_id = a.id
        left join admin_domain_mappings adm on adm.admin_id = a.id
        where a.role = 'DOMAIN_ADMIN'
          and (acm.company_id = $1::uuid or adm.domain_id = $2::uuid)
      `,
      [domain.company_id, domainId],
    );
    const adminIds = adminResult.rows.map((row) => row.id);

    const chargeResult = await client.query<{ id: string }>(
      `select id::text from charge_requests where domain_id = $1::uuid`,
      [domainId],
    );
    const chargeIds = chargeResult.rows.map((row) => row.id);

    await client.query(
      `
        delete from admin_request_event_log
        where event ->> 'domainId' = $1
           or event ->> 'requestId' = any($2::text[])
      `,
      [domainId, chargeIds],
    );
    await client.query(
      `
        delete from commission_records
        where domain_id = $1::uuid
           or charge_request_id = any($2::uuid[])
      `,
      [domainId, chargeIds],
    );
    await client.query(
      `delete from distributor_settlements where domain_id = $1::uuid`,
      [domainId],
    );
    await client.query(`delete from domain_settlements where domain_id = $1::uuid`, [domainId]);
    await client.query(`delete from exchange_requests where domain_id = $1::uuid`, [domainId]);
    await client.query(`delete from charge_requests where domain_id = $1::uuid`, [domainId]);
    await client.query(
      `
        delete from fee_rate_partners
        where fee_rate_id in (
          select id from fee_rates where domain_id = $1::uuid
        )
      `,
      [domainId],
    );
    await client.query(`delete from fee_rates where domain_id = $1::uuid`, [domainId]);
    await client.query(`delete from domains where id = $1::uuid`, [domainId]);

    const remainingDomains = await client.query<{ exists: boolean }>(
      `select exists(select 1 from domains where company_id = $1::uuid) as exists`,
      [domain.company_id],
    );

    if (remainingDomains.rows[0]?.exists) {
      return;
    }

    await client.query(`delete from commission_records where company_id = $1::uuid`, [domain.company_id]);
    await client.query(`delete from distributor_settlements where company_id = $1::uuid`, [domain.company_id]);
    await client.query(`delete from domain_settlements where company_id = $1::uuid`, [domain.company_id]);
    await client.query(`delete from exchange_requests where company_id = $1::uuid`, [domain.company_id]);
    await client.query(`delete from charge_requests where company_id = $1::uuid`, [domain.company_id]);
    await client.query(
      `
        delete from fee_rate_partners
        where fee_rate_id in (
          select id from fee_rates where company_id = $1::uuid
        )
      `,
      [domain.company_id],
    );
    await client.query(`delete from fee_rates where company_id = $1::uuid`, [domain.company_id]);
    await client.query(`delete from telegram_company_settings where company_id = $1::uuid`, [domain.company_id]);
    await client.query(`delete from bank_accounts where company_id = $1::uuid`, [domain.company_id]);
    await client.query(`delete from companies where id = $1::uuid`, [domain.company_id]);

    if (adminIds.length) {
      await client.query(`delete from admin_audit_logs where admin_id = any($1::uuid[])`, [adminIds]);
      await client.query(
        `
          delete from admins a
          where a.id = any($1::uuid[])
            and not exists (
              select 1 from admin_company_mappings acm where acm.admin_id = a.id
            )
            and not exists (
              select 1 from admin_domain_mappings adm where adm.admin_id = a.id
            )
        `,
        [adminIds],
      );
    }
  });
}

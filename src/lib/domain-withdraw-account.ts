import { query } from "@/lib/db";

export type DomainWithdrawAccount = {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
};

type DomainWithdrawAccountRow = {
  bank_name: string | null;
  account_holder: string | null;
  account_number: string | null;
};

function toWithdrawAccount(
  row: DomainWithdrawAccountRow | undefined,
): DomainWithdrawAccount | null {
  const bankName = row?.bank_name?.trim();
  const accountHolder = row?.account_holder?.trim();
  const accountNumber = row?.account_number?.trim();

  if (!bankName || !accountHolder || !accountNumber) {
    return null;
  }

  return {
    bankName,
    accountHolder,
    accountNumber,
  };
}

export async function getDomainWithdrawAccount(domainId: string) {
  const result = await query<DomainWithdrawAccountRow>(
    `
      select
        dom.withdraw_bank_name as bank_name,
        dom.withdraw_account_holder as account_holder,
        dom.withdraw_account_number as account_number
      from domains dom
      where dom.id = $1::uuid
        and dom.status <> 'DELETED'
        and exists (
          select 1
          from admin_domain_mappings scoped_adm
          join admins scoped_domain_admin on scoped_domain_admin.id = scoped_adm.admin_id
          where scoped_adm.domain_id = dom.id
            and scoped_domain_admin.role = 'DOMAIN_ADMIN'
            and scoped_domain_admin.status <> 'DELETED'
        )
      limit 1
    `,
    [domainId],
  );

  return toWithdrawAccount(result.rows[0]);
}

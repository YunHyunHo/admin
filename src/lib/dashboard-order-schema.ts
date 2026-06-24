import { query } from "@/lib/db";

let dashboardOrderSchemaPromise: Promise<void> | null = null;

async function ensureSchema() {
  if (!dashboardOrderSchemaPromise) {
    dashboardOrderSchemaPromise = (async () => {
      await query(`
        alter table domains
          add column if not exists dashboard_position integer
      `);
      await query(`
        create index if not exists idx_domains_dashboard_position
          on domains (dashboard_position)
      `);
    })().catch((error) => {
      dashboardOrderSchemaPromise = null;
      throw error;
    });
  }

  return dashboardOrderSchemaPromise;
}

export async function ensureDashboardOrderSchema() {
  await ensureSchema();
  await query(`
    with position_base as (
      select coalesce(max(dashboard_position), 0) as max_position
      from domains
    ),
    unpositioned_domains as (
      select
        dom.id,
        c.company_name,
        dom.current_balance
      from domains dom
      join companies c on c.id = dom.company_id
      where dom.dashboard_position is null
        and dom.status <> 'DELETED'
    ),
    charge_totals as (
      select
        candidate.id,
        coalesce(sum(cr.amount), 0) as charge_total
      from unpositioned_domains candidate
      left join charge_requests cr on cr.domain_id = candidate.id
        and cr.status in ('APPROVED', 'COMPLETED')
        and cr.processed_at is not null
        and (cr.processed_at at time zone 'Asia/Seoul')::date =
          (now() at time zone 'Asia/Seoul')::date
      group by candidate.id
    ),
    fee_totals as (
      select
        candidate.id,
        coalesce(sum(co.saved_commission), 0) as fee_total
      from unpositioned_domains candidate
      left join commission_records co on co.domain_id = candidate.id
        and co.status in ('APPROVED', 'COMPLETED')
        and (co.created_at at time zone 'Asia/Seoul')::date =
          (now() at time zone 'Asia/Seoul')::date
      group by candidate.id
    ),
    exchange_totals as (
      select
        candidate.id,
        coalesce(sum(er.amount), 0) as exchange_total
      from unpositioned_domains candidate
      left join exchange_requests er on er.domain_id = candidate.id
        and er.status in ('APPROVED', 'COMPLETED')
        and er.processed_at is not null
        and (er.processed_at at time zone 'Asia/Seoul')::date =
          (now() at time zone 'Asia/Seoul')::date
      group by candidate.id
    ),
    unpositioned as (
      select
        candidate.id,
        position_base.max_position + row_number() over (
          order by
            case when
              candidate.current_balance > 0 or
              charge_totals.charge_total > 0 or
              exchange_totals.exchange_total > 0 or
              fee_totals.fee_total > 0
            then 1 else 0 end desc,
            candidate.current_balance desc,
            charge_totals.charge_total desc,
            exchange_totals.exchange_total desc,
            fee_totals.fee_total desc,
            candidate.company_name asc,
            candidate.id asc
        ) as next_position
      from unpositioned_domains candidate
      join charge_totals on charge_totals.id = candidate.id
      join fee_totals on fee_totals.id = candidate.id
      join exchange_totals on exchange_totals.id = candidate.id
      cross join position_base
    )
    update domains dom
    set dashboard_position = unpositioned.next_position,
        updated_at = now()
    from unpositioned
    where dom.id = unpositioned.id
  `);
}

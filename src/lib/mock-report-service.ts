import {
  getApprovedRequestsByCompany,
  getDashboardSummaryByCompany,
  type ChargeRequestState,
} from "@/lib/mock-api-store";
import {
  getDomainNameByCompany,
  getFeeRateByCompanyFromSettings,
  parseKoreanWon,
} from "@/lib/charge-utils";
import type { AdminSettings } from "@/lib/settings-cookie";

const DISPLAY_YEAR = "2026";

export function getDefaultReportDateRange() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const now = new Date();
  const yesterday = new Date(now);

  yesterday.setDate(now.getDate() - 1);

  return {
    startDate: formatter.format(yesterday),
    endDate: formatter.format(now),
  };
}

function toIsoDate(mmddTime: string) {
  const [mmdd] = mmddTime.split(" ");
  const [month, day] = mmdd.split("-");

  return `${DISPLAY_YEAR}-${month}-${day}`;
}

function createDateRange(startDate: string, endDate: string) {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  while (cursor <= end) {
    const year = cursor.getUTCFullYear();
    const month = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    const date = String(cursor.getUTCDate()).padStart(2, "0");

    dates.push(`${year}-${month}-${date}`);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function isInRange(mmddTime: string, startDate: string, endDate: string) {
  const isoDate = toIsoDate(mmddTime);

  return isoDate >= startDate && isoDate <= endDate;
}

export function getDashboardSummary(
  companyName: string,
  state?: ChargeRequestState,
  settings?: AdminSettings,
) {
  return getDashboardSummaryByCompany(companyName, state, settings);
}

export function getSettlementProfit(
  companyName: string,
  startDate: string,
  endDate: string,
  state?: ChargeRequestState,
  settings?: AdminSettings,
) {
  const domainName = getDomainNameByCompany(companyName);
  const feeRate = getFeeRateByCompanyFromSettings(companyName, settings);
  const grouped = new Map<
    string,
    {
      date: string;
      chargeTotal: number;
      feeTotal: number;
      companyFeeTotal: number;
      distributorFeeTotal: number;
      payoutTotal: number;
    }
  >();

  for (const request of getApprovedRequestsByCompany(companyName, state)) {
    if (!isInRange(request.completedAt, startDate, endDate)) {
      continue;
    }

    const date = request.completedAt.slice(0, 5);
    const amount = parseKoreanWon(request.amount);
    const fee = Math.floor(amount * (feeRate / 100));
    const current = grouped.get(date) ?? {
      date,
      chargeTotal: 0,
      feeTotal: 0,
      companyFeeTotal: 0,
      distributorFeeTotal: 0,
      payoutTotal: 0,
    };

    current.chargeTotal += amount;
    current.feeTotal += fee;
    current.companyFeeTotal += fee;
    current.payoutTotal += amount - fee;
    grouped.set(date, current);
  }

  const rows = [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date));
  const totals = rows.reduce(
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
  );

  return {
    domainName,
    feeRate,
    rows,
    sections: [
      {
        id: "headquarters",
        title: "본사",
        category: "본사" as const,
        rows: rows.map((row) => ({
          ...row,
          feeTotal: row.companyFeeTotal,
          distributorFeeTotal: 0,
        })),
        totals: {
          chargeTotal: totals.chargeTotal,
          feeTotal: totals.companyFeeTotal,
          companyFeeTotal: totals.companyFeeTotal,
          distributorFeeTotal: 0,
          payoutTotal: totals.payoutTotal,
        },
      },
    ],
    totals,
  };
}

export function getDomainSettlement(
  companyName: string,
  startDate: string,
  endDate: string,
  state?: ChargeRequestState,
  settings?: AdminSettings,
) {
  const domainName = getDomainNameByCompany(companyName);
  const feeRate = getFeeRateByCompanyFromSettings(companyName, settings);
  const approvedRequests = getApprovedRequestsByCompany(companyName, state);
  const rows = createDateRange(startDate, endDate).map((date) => {
    const charge = approvedRequests
      .filter((request) => toIsoDate(request.completedAt) === date)
      .reduce((sum, request) => sum + parseKoreanWon(request.amount), 0);
    const distributor = Math.floor(charge * (feeRate / 100));

    return {
      date,
      domainName,
      charge,
      exchange: Math.max(0, charge - distributor),
      company: distributor,
      topDistributor: 0,
      distributor: 0,
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
      { charge: 0, exchange: 0, company: 0, topDistributor: 0, distributor: 0 },
    ),
  };
}

export function getFeeRecords(
  companyName: string,
  startDate: string,
  endDate: string,
  state?: ChargeRequestState,
  settings?: AdminSettings,
) {
  const feeRate = getFeeRateByCompanyFromSettings(companyName, settings);
  const rows = getApprovedRequestsByCompany(companyName, state)
    .filter((request) => isInRange(request.completedAt, startDate, endDate))
    .map((request) => {
      const amount = parseKoreanWon(request.amount);
      const fee = Math.floor(amount * (feeRate / 100));

      return {
        id: request.id,
        branch: request.branch,
        topAgent: request.topAgent,
        subAgent: request.subAgent,
        acquisitionBranch: companyName,
        domain: request.domain,
        uid: request.userId,
        amount,
        feeRate,
        fee,
        bankName: request.bankName,
        acquiredAt: request.completedAt,
        requestedAt: request.requestedAt,
      };
    })
    .sort((a, b) => b.acquiredAt.localeCompare(a.acquiredAt));

  return {
    rows,
    totals: rows.reduce(
      (sum, row) => ({
        amount: sum.amount + row.amount,
        fee: sum.fee + row.fee,
      }),
      { amount: 0, fee: 0 },
    ),
  };
}

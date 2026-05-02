import {
  getApprovedRequestsByCompany,
  getDashboardSummaryByCompany,
} from "@/lib/mock-api-store";
import {
  getDomainNameByCompany,
  getFeeRateByCompany,
  parseKoreanWon,
} from "@/lib/charge-utils";

const DISPLAY_YEAR = "2026";

export function getDefaultReportDateRange() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const endDate = formatter.format(new Date());

  return {
    startDate: `${endDate.slice(0, 8)}01`,
    endDate,
  };
}

function toIsoDate(mmddTime: string) {
  const [mmdd] = mmddTime.split(" ");
  const [month, day] = mmdd.split("-");

  return `${DISPLAY_YEAR}-${month}-${day}`;
}

function createDateRange(startDate: string, endDate: string) {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00+09:00`);
  const end = new Date(`${endDate}T00:00:00+09:00`);

  while (cursor <= end) {
    const year = cursor.getFullYear();
    const month = String(cursor.getMonth() + 1).padStart(2, "0");
    const date = String(cursor.getDate()).padStart(2, "0");

    dates.push(`${year}-${month}-${date}`);
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function isInRange(mmddTime: string, startDate: string, endDate: string) {
  const isoDate = toIsoDate(mmddTime);

  return isoDate >= startDate && isoDate <= endDate;
}

export function getDashboardSummary(companyName: string) {
  return getDashboardSummaryByCompany(companyName);
}

export function getSettlementProfit(companyName: string, startDate: string, endDate: string) {
  const domainName = getDomainNameByCompany(companyName);
  const feeRate = getFeeRateByCompany(companyName);
  const grouped = new Map<
    string,
    { date: string; chargeTotal: number; feeTotal: number; payoutTotal: number }
  >();

  for (const request of getApprovedRequestsByCompany(companyName)) {
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
      payoutTotal: 0,
    };

    current.chargeTotal += amount;
    current.feeTotal += fee;
    current.payoutTotal += amount - fee;
    grouped.set(date, current);
  }

  const rows = [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date));

  return {
    domainName,
    feeRate,
    rows,
    totals: rows.reduce(
      (sum, row) => ({
        chargeTotal: sum.chargeTotal + row.chargeTotal,
        feeTotal: sum.feeTotal + row.feeTotal,
        payoutTotal: sum.payoutTotal + row.payoutTotal,
      }),
      { chargeTotal: 0, feeTotal: 0, payoutTotal: 0 },
    ),
  };
}

export function getDomainSettlement(companyName: string, startDate: string, endDate: string) {
  const domainName = getDomainNameByCompany(companyName);
  const feeRate = getFeeRateByCompany(companyName);
  const approvedRequests = getApprovedRequestsByCompany(companyName);
  const rows = createDateRange(startDate, endDate).map((date) => {
    const charge = approvedRequests
      .filter((request) => toIsoDate(request.completedAt) === date)
      .reduce((sum, request) => sum + parseKoreanWon(request.amount), 0);
    const distributor = Math.floor(charge * (feeRate / 100));

    return {
      date,
      charge,
      exchange: Math.max(0, charge - distributor),
      distributor,
    };
  });

  return {
    domainName,
    rows,
    total: rows.reduce(
      (sum, row) => ({
        charge: sum.charge + row.charge,
        exchange: sum.exchange + row.exchange,
        distributor: sum.distributor + row.distributor,
      }),
      { charge: 0, exchange: 0, distributor: 0 },
    ),
  };
}

export function getFeeRecords(companyName: string, startDate: string, endDate: string) {
  const feeRate = getFeeRateByCompany(companyName);
  const rows = getApprovedRequestsByCompany(companyName)
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

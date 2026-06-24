export type PendingRequest = {
  id: string;
  companyName: string;
  branch: string;
  userId: string;
  topAgent: string;
  subAgent: string;
  domain: string;
  bankName: string;
  accountNumber: string;
  depositor: string;
  amount: string;
  requestedAt: string;
  requestedDate?: string;
};

export type ProcessedRequest = PendingRequest & {
  completedAt: string;
  completedDate?: string;
  status: "승인" | "승인거절";
};

export const companyDomainNames: Record<string, string> = {
  원페이: "원페이",
};

export const companyFeeRates: Record<string, number> = {
  원페이: 0.4,
};

export function parseKoreanWon(amount: string) {
  return Number(amount.replace(/[^\d]/g, ""));
}

export function formatKoreanWon(value: number) {
  return `${value.toLocaleString("ko-KR")} 원`;
}

export function getDomainNameByCompany(companyName: string) {
  return companyDomainNames[companyName] ?? companyName;
}

export function getFeeRateByCompany(companyName: string) {
  return companyFeeRates[companyName] ?? 0.4;
}

export function getFeeRateByCompanyFromSettings(
  companyName: string,
  settings?: { feeRates?: Record<string, number> },
) {
  return settings?.feeRates?.[companyName] ?? getFeeRateByCompany(companyName);
}

export function filterRequestsByCompany<T extends { domain: string }>(
  requests: T[],
  companyName: string,
) {
  const domainName = getDomainNameByCompany(companyName);

  return requests.filter((request) => request.domain === domainName);
}

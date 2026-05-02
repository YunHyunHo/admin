export type PendingRequest = {
  id: string;
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
};

export type ProcessedRequest = PendingRequest & {
  completedAt: string;
  status: "승인" | "승인거절";
};

export const pendingRequests: PendingRequest[] = [
  {
    id: "c0a8137",
    branch: "본사",
    userId: "kisIROCKS",
    topAgent: "댕댕이",
    subAgent: "수x",
    domain: "원페이",
    bankName: "신한은행",
    accountNumber: "010-8055-2165",
    depositor: "박기돈",
    amount: "50,000 원",
    requestedAt: "04-30 21:19:45",
  },
  {
    id: "7f19bb2",
    branch: "본사",
    userId: "dmalROCKS",
    topAgent: "댕댕이",
    subAgent: "수x",
    domain: "엠페이",
    bankName: "신한은행",
    accountNumber: "010-8055-2165",
    depositor: "박철",
    amount: "400,000 원",
    requestedAt: "04-30 21:19:12",
  },
];

export const approvedRequests: ProcessedRequest[] = [
  {
    id: "401001551",
    branch: "본사",
    userId: "aprilROCKS",
    topAgent: "댕댕이",
    subAgent: "수x",
    domain: "원페이",
    bankName: "신한은행",
    accountNumber: "010-8055-2165",
    depositor: "김사월",
    amount: "210,000 원",
    requestedAt: "04-01 10:14:11",
    completedAt: "04-01 10:14:19",
    status: "승인",
  },
  {
    id: "958088206",
    branch: "본사",
    userId: "tanIROCKS",
    topAgent: "댕댕이",
    subAgent: "수x",
    domain: "원페이",
    bankName: "신한은행",
    accountNumber: "010-8055-2165",
    depositor: "이봉근",
    amount: "160,000 원",
    requestedAt: "04-30 21:02:18",
    completedAt: "04-30 21:02:21",
    status: "승인",
  },
  {
    id: "831152098",
    branch: "본사",
    userId: "xhflROCKS",
    topAgent: "댕댕이",
    subAgent: "수x",
    domain: "엠페이",
    bankName: "신한은행",
    accountNumber: "010-8055-2165",
    depositor: "최기원",
    amount: "150,000 원",
    requestedAt: "04-29 21:04:59",
    completedAt: "04-29 21:05:06",
    status: "승인",
  },
  {
    id: "629188731",
    branch: "본사",
    userId: "nikiROCKS",
    topAgent: "댕댕이",
    subAgent: "수x",
    domain: "엠페이",
    bankName: "국민은행",
    accountNumber: "552201-04-112233",
    depositor: "송민준",
    amount: "2,800,000 원",
    requestedAt: "04-29 17:20:10",
    completedAt: "04-29 17:20:18",
    status: "승인",
  },
  {
    id: "551298101",
    branch: "본사",
    userId: "luckyROCKS",
    topAgent: "댕댕이",
    subAgent: "수x",
    domain: "엠페이",
    bankName: "국민은행",
    accountNumber: "552201-04-112233",
    depositor: "오진수",
    amount: "3,690,000 원",
    requestedAt: "04-28 16:50:01",
    completedAt: "04-28 16:50:07",
    status: "승인",
  },
  {
    id: "881290014",
    branch: "본사",
    userId: "betaROCKS",
    topAgent: "댕댕이",
    subAgent: "수x",
    domain: "엠페이",
    bankName: "하나은행",
    accountNumber: "190-222244-88901",
    depositor: "임도윤",
    amount: "1,250,000 원",
    requestedAt: "04-30 11:22:14",
    completedAt: "04-30 11:22:24",
    status: "승인",
  },
  {
    id: "114920871",
    branch: "본사",
    userId: "sunROCKS",
    topAgent: "댕댕이",
    subAgent: "수x",
    domain: "엠페이",
    bankName: "하나은행",
    accountNumber: "190-222244-88901",
    depositor: "양서윤",
    amount: "940,000 원",
    requestedAt: "04-27 09:12:03",
    completedAt: "04-27 09:12:09",
    status: "승인",
  },
];

export const rejectedRequests: ProcessedRequest[] = [
  {
    id: "731792168",
    branch: "본사",
    userId: "yswIROCKS",
    topAgent: "댕댕이",
    subAgent: "수x",
    domain: "원페이",
    bankName: "신한은행",
    accountNumber: "010-8055-2165",
    depositor: "양영익",
    amount: "30,000 원",
    requestedAt: "04-30 21:06:16",
    completedAt: "04-30 21:06:24",
    status: "승인거절",
  },
];

export const companyDomainNames: Record<string, string> = {
  원페이: "원페이",
  엠페이: "엠페이",
};

export const companyFeeRates: Record<string, number> = {
  원페이: 0.4,
  엠페이: 0.55,
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

export function filterRequestsByCompany<
  T extends { domain: string }
>(requests: T[], companyName: string) {
  const domainName = getDomainNameByCompany(companyName);
  return requests.filter((request) => request.domain === domainName);
}

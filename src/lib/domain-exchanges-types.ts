export type DomainExchangeRow = {
  id: string;
  branch: string;
  topDistributor: string;
  distributor: string;
  loginId: string;
  domain: string;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  amount: number;
  requestedAt: string;
  completedAt: string;
  status: "대기" | "승인" | "거절";
};

export type DomainExchangeOption = {
  id: string;
  name: string;
};

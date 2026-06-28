export type DomainExchangeRow = {
  id: string;
  branch: string;
  topDistributor: string;
  distributor: string;
  loginId: string;
  companyName: string;
  domain: string;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  amount: number;
  requestedAt: string;
  completedAt: string;
  status: "승인중" | "승인" | "승인거절";
};

export type DomainExchangeOption = {
  id: string;
  name: string;
};

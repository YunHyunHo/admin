export type TransactionStatus = "승인" | "승인취소";

export type LedgerRow = {
  id: string;
  branch: string;
  userId: string;
  topDistributor: string;
  distributor: string;
  domain: string;
  bankInfo: string;
  depositor: string;
  amount: number;
  requestedAt: string;
  completedAt: string;
  status: TransactionStatus;
};

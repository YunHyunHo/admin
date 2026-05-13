export type TransactionStatus = "승인중" | "완료" | "승인취소";
export type LedgerTransactionType = "충전" | "환전";

export type LedgerRow = {
  id: string;
  transactionType?: LedgerTransactionType;
  branch: string;
  userId: string;
  topDistributor: string;
  distributor: string;
  domain: string;
  companyName?: string;
  bankInfo: string;
  bankName?: string;
  accountNumber?: string;
  accountHolder?: string;
  depositor: string;
  amount: number;
  fee?: number;
  requestedAt: string;
  completedAt: string;
  status: TransactionStatus;
};

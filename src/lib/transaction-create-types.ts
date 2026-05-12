export type TransactionCreateRow = {
  id: string;
  tradedAt: string;
  buyerWallet: string;
  coin: string;
  quantity: number;
  depositor: string;
  amount: number;
  status: "완료" | "대기";
  bankInfo: string;
};

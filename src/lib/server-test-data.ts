import type { PendingRequest, ProcessedRequest } from "@/lib/charge-utils";

export const pendingRequests: PendingRequest[] = [
  {
    id: "TEST-CHARGE-001",
    branch: "본사",
    userId: "test_user_one",
    topAgent: "테스트총판A",
    subAgent: "테스트지점A",
    domain: "원페이",
    bankName: "테스트은행",
    accountNumber: "111-222-333001",
    depositor: "테스트입금자1",
    amount: "100,000 원",
    requestedAt: "05-02 10:00:00",
  },
];

export const approvedRequests: ProcessedRequest[] = [];

export const rejectedRequests: ProcessedRequest[] = [];

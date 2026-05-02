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
  {
    id: "TEST-CHARGE-002",
    branch: "본사",
    userId: "test_user_two",
    topAgent: "테스트총판B",
    subAgent: "테스트지점B",
    domain: "엠페이",
    bankName: "테스트은행",
    accountNumber: "222-333-444002",
    depositor: "테스트입금자2",
    amount: "200,000 원",
    requestedAt: "05-02 10:05:00",
  },
  {
    id: "TEST-CHARGE-003",
    branch: "본사",
    userId: "test_user_three",
    topAgent: "테스트총판B",
    subAgent: "테스트지점C",
    domain: "엠페이",
    bankName: "테스트은행",
    accountNumber: "333-444-555003",
    depositor: "테스트입금자3",
    amount: "300,000 원",
    requestedAt: "05-02 10:10:00",
  },
];

export const approvedRequests: ProcessedRequest[] = [];

export const rejectedRequests: ProcessedRequest[] = [];

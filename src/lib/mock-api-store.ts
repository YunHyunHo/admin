import {
  approvedRequests,
  pendingRequests,
  rejectedRequests,
} from "@/lib/server-test-data";
import {
  filterRequestsByCompany,
  getDomainNameByCompany,
  getFeeRateByCompanyFromSettings,
  parseKoreanWon,
  type PendingRequest,
  type ProcessedRequest,
} from "@/lib/charge-utils";
import type { AdminSettings } from "@/lib/settings-cookie";
import { getKoreanNowStamp } from "@/lib/korean-time";

export type ChargeRequestState = {
  pending: PendingRequest[];
  approved: ProcessedRequest[];
  rejected: ProcessedRequest[];
};

type GlobalMockStore = typeof globalThis & {
  __vendorAdminMockStore?: ChargeRequestState;
};

function clonePending(requests: PendingRequest[]) {
  return requests.map((request) => ({ ...request }));
}

function cloneProcessed(requests: ProcessedRequest[]) {
  return requests.map((request) => ({ ...request }));
}

function getNowStamp() {
  return getKoreanNowStamp();
}

function getStore() {
  const globalStore = globalThis as GlobalMockStore;

  if (!globalStore.__vendorAdminMockStore) {
    globalStore.__vendorAdminMockStore = {
      pending: clonePending(pendingRequests),
      approved: cloneProcessed(approvedRequests),
      rejected: cloneProcessed(rejectedRequests),
    };
  }

  return globalStore.__vendorAdminMockStore;
}

export function getDefaultChargeRequestState(): ChargeRequestState {
  return {
    pending: clonePending(pendingRequests),
    approved: cloneProcessed(approvedRequests),
    rejected: cloneProcessed(rejectedRequests),
  };
}

export function getChargeRequestsByCompany(
  companyName: string,
  state: ChargeRequestState = getStore(),
) {
  return {
    pending: filterRequestsByCompany(state.pending, companyName),
    approved: filterRequestsByCompany(state.approved, companyName),
    rejected: filterRequestsByCompany(state.rejected, companyName),
  };
}

export function processChargeRequest(
  companyName: string,
  requestId: string,
  status: ProcessedRequest["status"],
  state: ChargeRequestState = getStore(),
) {
  const companyPending = filterRequestsByCompany(state.pending, companyName);
  const companyRejected = filterRequestsByCompany(state.rejected, companyName);
  const target =
    companyPending.find((request) => request.id === requestId) ??
    (status === "승인"
      ? companyRejected.find((request) => request.id === requestId)
      : undefined);

  if (!target) {
    return null;
  }

  const processedRequest: ProcessedRequest = {
    ...target,
    completedAt: getNowStamp(),
    status,
  };

  state.pending = state.pending.filter((request) => request.id !== requestId);
  state.rejected = state.rejected.filter((request) => request.id !== requestId);

  if (status === "승인") {
    state.approved = [processedRequest, ...state.approved];
  } else {
    state.rejected = [processedRequest, ...state.rejected];
  }

  return processedRequest;
}

export function resetMockChargeRequests() {
  const globalStore = globalThis as GlobalMockStore;

  globalStore.__vendorAdminMockStore = getDefaultChargeRequestState();

  return globalStore.__vendorAdminMockStore;
}

export function getApprovedRequestsByCompany(
  companyName: string,
  state: ChargeRequestState = getStore(),
) {
  return getChargeRequestsByCompany(companyName, state).approved;
}

export function getDashboardSummaryByCompany(
  companyName: string,
  state: ChargeRequestState = getStore(),
  settings?: AdminSettings,
) {
  const { pending, approved, rejected } = getChargeRequestsByCompany(
    companyName,
    state,
  );
  const domainName = getDomainNameByCompany(companyName);
  const feeRate = getFeeRateByCompanyFromSettings(companyName, settings);
  const approvedChargeTotal = approved.reduce(
    (sum, request) => sum + parseKoreanWon(request.amount),
    0,
  );
  const pendingChargeTotal = pending.reduce(
    (sum, request) => sum + parseKoreanWon(request.amount),
    0,
  );

  return {
    domainName,
    feeRate,
    pendingCount: pending.length,
    approvedCount: approved.length,
    rejectedCount: rejected.length,
    pendingChargeTotal,
    approvedChargeTotal,
    feeTotal: Math.floor(approvedChargeTotal * (feeRate / 100)),
  };
}

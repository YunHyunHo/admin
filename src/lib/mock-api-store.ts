import {
  approvedRequests,
  filterRequestsByCompany,
  pendingRequests,
  rejectedRequests,
  type PendingRequest,
  type ProcessedRequest,
} from "@/lib/mock-charge-data";

type ChargeRequestState = {
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
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${value.month}-${value.day} ${value.hour}:${value.minute}:${value.second}`;
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

export function getChargeRequestsByCompany(companyName: string) {
  const store = getStore();

  return {
    pending: filterRequestsByCompany(store.pending, companyName),
    approved: filterRequestsByCompany(store.approved, companyName),
    rejected: filterRequestsByCompany(store.rejected, companyName),
  };
}

export function processChargeRequest(
  companyName: string,
  requestId: string,
  status: ProcessedRequest["status"],
) {
  const store = getStore();
  const companyPending = filterRequestsByCompany(store.pending, companyName);
  const target = companyPending.find((request) => request.id === requestId);

  if (!target) {
    return null;
  }

  const processedRequest: ProcessedRequest = {
    ...target,
    completedAt: getNowStamp(),
    status,
  };

  store.pending = store.pending.filter((request) => request.id !== requestId);

  if (status === "승인") {
    store.approved = [processedRequest, ...store.approved];
  } else {
    store.rejected = [processedRequest, ...store.rejected];
  }

  return processedRequest;
}

export function resetMockChargeRequests() {
  const globalStore = globalThis as GlobalMockStore;

  globalStore.__vendorAdminMockStore = {
    pending: clonePending(pendingRequests),
    approved: cloneProcessed(approvedRequests),
    rejected: cloneProcessed(rejectedRequests),
  };

  return globalStore.__vendorAdminMockStore;
}

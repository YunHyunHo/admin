/** Per-tab notification state. Never store this in account-wide localStorage. */
export function createRealtimeNoticeLedger(storage: Pick<Storage, "getItem" | "setItem">, key: string) {
  const retentionMs = 30 * 24 * 60 * 60 * 1000;
  const completed: Record<string, number> = {};
  let pending: Record<string, string> = {};
  try {
    const value = JSON.parse(storage.getItem(key) ?? "{}");
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [id, at] of Object.entries(value)) {
        if (typeof at === "number" && at > Date.now() - retentionMs) completed[id] = at;
      }
    }
    const backlog = JSON.parse(storage.getItem(`${key}:pending`) ?? "{}");
    if (backlog && typeof backlog === "object" && !Array.isArray(backlog)) {
      pending = Object.fromEntries(Object.entries(backlog).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    }
  } catch { /* Restricted storage: retain in-memory deduplication. */ }
  const save = () => {
    try {
      storage.setItem(key, JSON.stringify(completed));
      storage.setItem(`${key}:pending`, JSON.stringify(pending));
    } catch { /* Best effort. */ }
  };
  return {
    has(eventId: string, requestKey: string) {
      return !!completed[`event:${eventId}`] || !!completed[`fallback:${requestKey}`];
    },
    complete(eventId: string, requestKey: string) {
      completed[`event:${eventId}`] = Date.now();
      delete completed[`fallback:${requestKey}`];
      delete pending[eventId];
      save();
    },
    queue(eventId: string, requestKey: string) { pending[eventId] = requestKey; save(); },
    pending() { return Object.entries(pending); },
    completeFallback(requestKeys: string[]) {
      for (const requestKey of requestKeys) completed[`fallback:${requestKey}`] = Date.now();
      save();
    },
  };
}

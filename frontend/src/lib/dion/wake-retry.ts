export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}

export type WakeState = { waiting: boolean; exhausted: boolean };
type Options = { method?: string; body?: unknown; token?: string; signal?: AbortSignal; onState?: (state: WakeState) => void };
type Runtime = { fetch?: typeof fetch; now?: () => number; sleep?: (ms: number, signal: AbortSignal) => Promise<void>; budgetMs?: number };

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

// Reuse the exact serialized body/request_key across attempts. No new save/run ID.
export async function requestJson(path: string, options: Options = {}, runtime: Runtime = {}) {
  const { method = "GET", body, token, signal, onState } = options;
  const send = runtime.fetch ?? fetch, now = runtime.now ?? Date.now, sleep = runtime.sleep ?? delay;
  const budget = runtime.budgetMs ?? 90_000, deadline = now() + budget;
  const serialized = body === undefined ? undefined : JSON.stringify(body);
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(() => controller.abort(new DOMException("Server wake deadline", "TimeoutError")), budget);
  let backoff = 1_000, exhausted = false, failure: unknown;
  try {
    while (true) {
      signal?.throwIfAborted();
      try {
        const response = await send(path, { method, body: serialized, headers: {
          "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}),
        }, cache: "no-store", signal: controller.signal });
        const value = await response.json().catch(error => { if (controller.signal.aborted) throw error; return null; });
        signal?.throwIfAborted();
        if (!response.ok) throw new ApiError(response.status, String(value?.detail?.code ?? `HTTP_${response.status}`));
        return value;
      } catch (error) {
        signal?.throwIfAborted();
        if (!(error instanceof ApiError && error.status === 503) && !(error instanceof TypeError)
            && !(error instanceof Error && error.name === "NetworkError") && !controller.signal.aborted) throw error;
        failure = error;
      }
      const remaining = deadline - now();
      if (remaining <= 0 || controller.signal.aborted) { exhausted = true; throw failure; }
      onState?.({ waiting: true, exhausted: false });
      try { await sleep(Math.min(backoff, remaining), controller.signal); }
      catch (error) { signal?.throwIfAborted(); if (!controller.signal.aborted) throw error; exhausted = true; throw failure; }
      if (now() >= deadline || controller.signal.aborted) { exhausted = true; throw failure; }
      backoff = Math.min(backoff * 2, 10_000);
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    onState?.({ waiting: false, exhausted });
  }
}

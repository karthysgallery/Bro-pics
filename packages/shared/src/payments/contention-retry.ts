/**
 * Firestore gives up on a transaction that keeps colliding with others on the same document (ABORTED / "lock timeout").
 * The numbering counters (order number, invoice number) are such documents: every checkout and every payment touches
 * them, so a burst of customers makes some transactions lose. Losing is harmless to repeat: the work is idempotent
 * (see handlePaymentCaptured) or has not written anything yet. Retry a few times with jittered backoff instead of
 * telling a customer who has just paid that something went wrong.
 */
export function isContentionError(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  if (!e) return false;
  if (e.code === 10 || e.code === 'aborted') return true;
  // "Transaction is invalid or closed": the server already dropped this attempt while it was waiting on others; a fresh one is fine.
  return typeof e.message === 'string' && /ABORTED|lock timeout|too much contention|Transaction is invalid or closed/i.test(e.message);
}

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Injected in tests. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export async function retryOnContention<T>(work: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { attempts = 6, baseDelayMs = 150, maxDelayMs = 3000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), random = Math.random } = opts;
  for (let attempt = 1; ; attempt++) {
    try {
      return await work();
    } catch (err) {
      if (attempt >= attempts || !isContentionError(err)) throw err;
      // Full jitter: spreads the waiting callers apart so they stop colliding in lockstep.
      await sleep(Math.floor(random() * Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))));
    }
  }
}

/**
 * One transaction at a time per key inside this process. Several checkouts on the same server that each read the counter
 * and then write it deadlock each other (every one holds the read lock the others need to write), and Firestore only
 * resolves that by timing one out after ~30 seconds. Queueing them here removes the collisions between requests of the
 * same server; only the few servers (Cloud Run instances) can still meet, and retryOnContention covers those.
 */
const tails = new Map<string, Promise<unknown>>();

export function serialized<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const run = previous.then(work, work);
  const tail = run.catch(() => undefined);
  tails.set(key, tail);
  void tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return run;
}

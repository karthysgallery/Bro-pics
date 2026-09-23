// 5 total attempts (matches BE-17's "Cloud Tasks retries (5, backoff)"),
// with the delay growing between each. After the 5th attempt fails there's
// no 5th delay to compute — the job goes straight to failed_permanent.
export const MAX_PRINT_JOB_ATTEMPTS = 5;

const BACKOFF_MINUTES_AFTER_ATTEMPT: Record<number, number> = {
  1: 1,
  2: 5,
  3: 15,
  4: 60,
};

/**
 * Minutes to wait before the next lease is grantable, given the attempt
 * number that just failed (1-indexed). Returns null once attempts are
 * exhausted — the caller should mark the job failed_permanent instead of
 * scheduling a retry.
 */
export function backoffMinutesAfterAttempt(attempt: number): number | null {
  if (attempt >= MAX_PRINT_JOB_ATTEMPTS) return null;
  return BACKOFF_MINUTES_AFTER_ATTEMPT[attempt] ?? null;
}

/** Deterministic print-job id — creating a job for an order/item pair that
 * already has one is a no-op instead of creating a duplicate. */
export function printJobId(orderId: string, itemId: string): string {
  return `${orderId}_${itemId}`;
}

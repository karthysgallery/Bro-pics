import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { PrintJobSchema, type PrintJobStatus } from '../schemas/print-job';
import { printJobId, backoffMinutesAfterAttempt, MAX_PRINT_JOB_ATTEMPTS } from './backoff';

const COLLECTION = 'printJobs';

// Firestore returns a Timestamp (not a JS Date) for date fields on read —
// re-parsing a read doc through PrintJobSchema (whose fields are z.date())
// would throw. This project's established pattern (see apps/web's
// checkout page) is to read raw fields directly off snapshot data instead
// of round-tripping reads through a write-time schema. toJsDate handles
// the Timestamp -> Date conversion for the couple of fields these
// functions need to compare against `now`.
function toJsDate(value: unknown): Date | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return undefined;
}

interface RawPrintJobFields {
  status: PrintJobStatus;
  attempts: number;
  nextAttemptAt?: unknown;
}

/**
 * Creates a queued print job for one order item, or does nothing if a job
 * for this exact (orderId, itemId) already exists — the deterministic id
 * makes this call idempotent, so a webhook retry or a re-run of the
 * job-creation step for an order never produces duplicate jobs.
 */
export async function createPrintJob(
  db: Firestore,
  orderId: string,
  itemId: string,
  customizationId: string
): Promise<void> {
  const id = printJobId(orderId, itemId);
  const ref = db.collection(COLLECTION).doc(id);
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (snap.exists) return;
    const now = new Date();
    const job = PrintJobSchema.parse({
      id,
      orderId,
      itemId,
      customizationId,
      status: 'queued',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    });
    transaction.set(ref, job);
  });
}

export class PrintJobNotLeasableError extends Error {}

/**
 * Claims a job for rendering: only succeeds if the job is queued, or
 * failed with its backoff window elapsed. Bumps attempts and stamps a
 * lease. The in-transaction read is the authoritative check — a second
 * concurrent lease attempt on the same job will see the update this one
 * makes and fail Firestore's optimistic-concurrency check, never granting
 * two simultaneous leases on the same job.
 */
export async function leasePrintJob(db: Firestore, jobId: string, leaseDurationMinutes = 10): Promise<void> {
  const ref = db.collection(COLLECTION).doc(jobId);
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) {
      throw new PrintJobNotLeasableError(`No such print job: ${jobId}`);
    }
    const raw = snap.data() as RawPrintJobFields;
    const now = new Date();
    const nextAttemptAt = toJsDate(raw.nextAttemptAt);
    const leasable = raw.status === 'queued' || (raw.status === 'failed' && (!nextAttemptAt || nextAttemptAt <= now));
    if (!leasable) {
      throw new PrintJobNotLeasableError(`Print job ${jobId} is not leasable (status: ${raw.status})`);
    }
    transaction.update(ref, {
      status: 'leased' satisfies PrintJobStatus,
      attempts: raw.attempts + 1,
      leasedAt: now,
      leaseExpiresAt: new Date(now.getTime() + leaseDurationMinutes * 60_000),
      updatedAt: now,
      // update() (unlike set()) only touches the keys given, so a stale
      // nextAttemptAt left over from a prior failed attempt must be
      // explicitly deleted rather than just omitted here.
      ...(nextAttemptAt ? { nextAttemptAt: FieldValue.delete() } : {}),
    });
  });
}

export async function completePrintJob(db: Firestore, jobId: string, renderedFilePath: string): Promise<void> {
  const ref = db.collection(COLLECTION).doc(jobId);
  await ref.update({
    status: 'done' satisfies PrintJobStatus,
    renderedFilePath,
    updatedAt: new Date(),
  });
}

/**
 * Records a failed lease attempt. Schedules a backoff-gated retry unless
 * MAX_PRINT_JOB_ATTEMPTS has been reached, in which case the job moves to
 * failed_permanent for a human to look at.
 */
export async function failPrintJob(db: Firestore, jobId: string, error: string): Promise<void> {
  const ref = db.collection(COLLECTION).doc(jobId);
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return;
    const raw = snap.data() as RawPrintJobFields;
    const now = new Date();
    const delayMinutes = backoffMinutesAfterAttempt(raw.attempts);
    const update =
      delayMinutes === null || raw.attempts >= MAX_PRINT_JOB_ATTEMPTS
        ? { status: 'failed_permanent' as const, lastError: error, updatedAt: now }
        : {
            status: 'failed' as const,
            lastError: error,
            updatedAt: now,
            nextAttemptAt: new Date(now.getTime() + delayMinutes * 60_000),
          };
    transaction.update(ref, update);
  });
}

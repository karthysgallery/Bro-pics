import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Connects the order flow to the private print renderer (services/print-render
 * on Cloud Run).
 *
 *   payment confirmed -> order "print_rendering" + printJobs/{orderId_itemId} queued
 *     -> dispatchPrintJob (this file) -> POST {PRINT_RENDER_URL}/render/{jobId}
 *        with a Google-signed ID token (the service rejects anyone else)
 *     -> renderer leases the job, renders the printed artwork, stores
 *        print-files/{orderId}/{itemId}/print.png, then marks the job done and
 *        moves the order to print_ready — or records the failure with a backoff.
 *
 * Retries are owned by the job record, not by the platform: the trigger has
 * platform retries off, and sweepPrintJobs re-dispatches whatever is due.
 * Dispatching twice is harmless — only one lease can be held at a time and
 * the renderer answers 409 to the loser.
 */

const PRINT_RENDER_URL = defineString('PRINT_RENDER_URL', {
  description: 'Private Cloud Run URL of the print renderer, e.g. https://print-render-xxxx.a.run.app',
});
// Jobs created before this ISO time are never picked up by the sweep, so
// switching dispatch on does not suddenly render an old backlog. Empty = no cutoff.
const PRINT_DISPATCH_AFTER = defineString('PRINT_DISPATCH_AFTER', { default: '' });

const LOST_DISPATCH_MINUTES = 5;
const SWEEP_LIMIT = 10;

type JobFields = {
  status?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  nextAttemptAt?: unknown;
  leaseExpiresAt?: unknown;
};

function toDate(value: unknown): Date | undefined {
  if (value instanceof Date) return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return undefined;
}

/** A write that just put the job into "queued": new job, admin retry or re-render. */
export function becameQueued(before: JobFields | undefined, after: JobFields | undefined): boolean {
  return after?.status === 'queued' && before?.status !== 'queued';
}

/** Whether the sweep should (re)send this job to the renderer now. */
export function dueForDispatch(job: JobFields, now: Date, notBefore?: Date): boolean {
  const createdAt = toDate(job.createdAt);
  if (notBefore && (!createdAt || createdAt < notBefore)) return false;
  switch (job.status) {
    case 'failed': {
      const next = toDate(job.nextAttemptAt);
      return !next || next <= now;
    }
    case 'leased': {
      // The worker died or timed out; the lease can be taken over.
      const expires = toDate(job.leaseExpiresAt);
      return expires !== undefined && expires <= now;
    }
    case 'queued': {
      // The trigger's own dispatch was lost (renderer down, cold start error).
      const updated = toDate(job.updatedAt) ?? toDate(job.createdAt);
      return updated !== undefined && now.getTime() - updated.getTime() >= LOST_DISPATCH_MINUTES * 60_000;
    }
    default:
      return false;
  }
}

export type DispatchResult = 'rendered' | 'busy' | 'failed';

export interface DispatchDeps {
  fetch: typeof fetch;
  /** A Google-signed ID token for the renderer's URL, or null when running on the emulator. */
  idToken(audience: string): Promise<string | null>;
}

export async function dispatchToRenderer(serviceUrl: string, jobId: string, deps: DispatchDeps): Promise<DispatchResult> {
  const base = serviceUrl.replace(/\/$/, '');
  const token = await deps.idToken(base);
  const res = await deps.fetch(`${base}/render/${encodeURIComponent(jobId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: '{}',
  });
  if (res.ok) return 'rendered';
  // 409: someone else holds the lease, or the job is already done — not an error.
  if (res.status === 409) return 'busy';
  logger.warn('Print render failed', { jobId, status: res.status, body: (await res.text().catch(() => '')).slice(0, 500) });
  return 'failed';
}

/** Identity token from the metadata server, for the function's own runtime service account. */
async function metadataIdToken(audience: string): Promise<string | null> {
  if (process.env.FUNCTIONS_EMULATOR === 'true') return null;
  const res = await fetch(
    `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`,
    { headers: { 'Metadata-Flavor': 'Google' } }
  );
  if (!res.ok) throw new Error(`Could not get an ID token for the print renderer (${res.status})`);
  return res.text();
}

const realDeps: DispatchDeps = { fetch: (...args) => fetch(...args), idToken: metadataIdToken };

export const dispatchPrintJob = onDocumentWritten(
  // Rendering a large print can take a while; the renderer's own timeout is shorter than the 10-minute lease.
  // Same region as the Firestore database (asia-south1), where the print service also runs.
  { document: 'printJobs/{jobId}', region: 'asia-south1', retry: false, timeoutSeconds: 540 },
  async (event) => {
    const before = event.data?.before.exists ? (event.data.before.data() as JobFields) : undefined;
    const after = event.data?.after.exists ? (event.data.after.data() as JobFields) : undefined;
    if (!becameQueued(before, after)) return;
    const jobId = event.params.jobId;
    try {
      const result = await dispatchToRenderer(PRINT_RENDER_URL.value(), jobId, realDeps);
      logger.info('Print job dispatched', { jobId, result });
    } catch (error) {
      // The job stays queued; sweepPrintJobs sends it again.
      logger.error('Print job dispatch error', { jobId, error: String(error) });
    }
  }
);

export const sweepPrintJobs = onSchedule({ schedule: 'every 5 minutes', region: 'asia-south1', timeoutSeconds: 540 }, async () => {
  const db = getFirestore();
  const now = new Date();
  const cutoffRaw = PRINT_DISPATCH_AFTER.value();
  const notBefore = cutoffRaw ? new Date(cutoffRaw) : undefined;
  if (notBefore && Number.isNaN(notBefore.getTime())) {
    logger.error('PRINT_DISPATCH_AFTER is not a valid date; sweep skipped', { cutoffRaw });
    return;
  }

  // Single-field equality queries only (no composite indexes needed).
  const snapshots = await Promise.all(
    ['failed', 'leased', 'queued'].map((status) => db.collection('printJobs').where('status', '==', status).limit(100).get())
  );
  const due = snapshots
    .flatMap((s) => s.docs)
    .filter((doc) => dueForDispatch(doc.data() as JobFields, now, notBefore))
    .slice(0, SWEEP_LIMIT);
  if (due.length === 0) return;

  const results = await Promise.allSettled(due.map((doc) => dispatchToRenderer(PRINT_RENDER_URL.value(), doc.id, realDeps)));
  logger.info('Print sweep', {
    dispatched: due.map((d, i) => ({ jobId: d.id, result: results[i]!.status === 'fulfilled' ? (results[i] as PromiseFulfilledResult<DispatchResult>).value : 'error' })),
  });
});

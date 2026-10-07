import { describe, it, expect, beforeAll } from 'vitest';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  leasePrintJob,
  completePrintJobAndAdvanceOrder,
  failPrintJob,
  PrintJobNotLeasableError,
} from '@bro-pics/shared/src/print-jobs/print-jobs';

// Real transactions need the Firestore emulator: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080.
const onEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

describe.skipIf(!onEmulator)('print job leasing (Firestore emulator)', () => {
  let db: Firestore;
  beforeAll(() => {
    db = getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-bropics' }));
  });

  async function seed(id: string, overrides: Record<string, unknown> = {}) {
    const now = new Date();
    await db.doc(`orders/order_${id}`).set({ status: 'print_rendering' });
    await db.doc(`printJobs/${id}`).set({ id, orderId: `order_${id}`, itemId: 'i', personalizationId: 'p', status: 'queued', attempts: 0, createdAt: now, updatedAt: now, ...overrides });
  }

  it('grants only one of two simultaneous leases', async () => {
    await seed('race');
    const results = await Promise.allSettled([leasePrintJob(db, 'race'), leasePrintJob(db, 'race')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(PrintJobNotLeasableError);
  });

  it('lets a retry take over an expired lease, and the old worker can no longer finish or fail it', async () => {
    await seed('stale');
    const first = await leasePrintJob(db, 'stale', -1); // lease already expired: the worker "died"
    const second = await leasePrintJob(db, 'stale');
    expect([first, second]).toEqual([1, 2]);

    await failPrintJob(db, 'stale', 'late error from the dead worker', first);
    await completePrintJobAndAdvanceOrder(db, 'stale', 'print-files/stale.png', first);
    let job = (await db.doc('printJobs/stale').get()).data()!;
    expect(job.status).toBe('leased');

    await completePrintJobAndAdvanceOrder(db, 'stale', 'print-files/order_stale/i/print.png', second);
    job = (await db.doc('printJobs/stale').get()).data()!;
    expect(job).toMatchObject({ status: 'done', renderedFilePath: 'print-files/order_stale/i/print.png' });
    expect((await db.doc('orders/order_stale').get()).data()!.status).toBe('print_ready');
  });

  it('does not lease a job that is done or held by a live worker', async () => {
    await seed('finished', { status: 'done' });
    await expect(leasePrintJob(db, 'finished')).rejects.toBeInstanceOf(PrintJobNotLeasableError);
    await seed('busy');
    await leasePrintJob(db, 'busy');
    await expect(leasePrintJob(db, 'busy')).rejects.toBeInstanceOf(PrintJobNotLeasableError);
  });
});

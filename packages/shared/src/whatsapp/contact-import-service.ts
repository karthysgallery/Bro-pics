import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import type { Customer } from '../schemas/billing';
import { loadSuppressedIds, recordMarketingOptOut, SUPPRESSIONS } from './consent';
import { CONFLICT_STRATEGIES, errorReportCsv, parseContactRows, parseCsv, planImport, type ConflictStrategy, type ImportPlan } from './contact-import';

/**
 * The database side of a contact import. The preview and the real import run the SAME code and the plan is always
 * recomputed here from the file and the current database: nothing the browser says about the plan is trusted.
 * Server-only.
 */

export const IMPORTS = 'whatsappImports';

async function loadExisting(db: Firestore, ids: string[]): Promise<Map<string, Customer>> {
  const out = new Map<string, Customer>();
  for (let i = 0; i < ids.length; i += 300) {
    const refs = ids.slice(i, i + 300).map((id) => db.collection('customers').doc(id));
    if (refs.length === 0) continue;
    for (const snap of await db.getAll(...refs)) if (snap.exists) out.set(snap.id, snap.data() as Customer);
  }
  return out;
}

export interface PlanSummary {
  strategy: ConflictStrategy;
  counts: ImportPlan['counts'];
  headerProblems: string[];
  /** First rows only; phones are masked and no names or emails are included. */
  sample: Array<{ line: number; action: string; phone: string; warnings: string[] }>;
  issues: Array<{ line: number; field: string; message: string }>;
  reportCsv: string;
}

export function summarise(plan: ImportPlan): PlanSummary {
  return {
    strategy: plan.strategy,
    counts: plan.counts,
    headerProblems: plan.headerProblems,
    sample: plan.rows.slice(0, 50).map((r) => ({ line: r.line, action: r.action, phone: r.phone, warnings: r.warnings })),
    issues: plan.issues.slice(0, 200),
    reportCsv: errorReportCsv(plan),
  };
}

export async function buildPlan(db: Firestore, csv: string, strategy: ConflictStrategy, now = new Date()): Promise<ImportPlan> {
  if (!CONFLICT_STRATEGIES.includes(strategy)) throw new Error('Unknown conflict strategy.');
  const parsed = parseContactRows(parseCsv(csv), now);
  const ids = parsed.rows.map((r) => `p${r.phone.replace(/\D/g, '')}`);
  const [existing, suppressed] = await Promise.all([loadExisting(db, [...new Set(ids)]), loadSuppressedIds(db)]);
  return planImport(parsed, existing, suppressed, strategy, now.toISOString());
}

export class PlanChangedError extends Error {
  constructor() {
    super('The customer list changed since the preview. Run the preview again before importing.');
    this.name = 'PlanChangedError';
  }
}

/**
 * Writes a plan. `expect` is the preview's counts: if the recomputed plan differs (somebody else imported, or edited a
 * customer, in between) nothing is written. An opt-out found in the file is written through the suppression path.
 */
export async function commitImport(db: Firestore, input: { csv: string; strategy: ConflictStrategy; actorUid: string; expect: { create: number; update: number }; now?: Date }): Promise<{ importId: string; created: number; updated: number; skipped: number; plan: PlanSummary }> {
  const now = input.now ?? new Date();
  const plan = await buildPlan(db, input.csv, input.strategy, now);
  if (plan.headerProblems.length) throw new Error(plan.headerProblems.join(' '));
  if (plan.counts.create !== input.expect.create || plan.counts.update !== input.expect.update) throw new PlanChangedError();

  const nowIso = now.toISOString();
  const writes = plan.rows.filter((r) => r.action === 'create' || r.action === 'update');
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    for (const r of writes.slice(i, i + 400)) {
      const ref = db.collection('customers').doc(r.customerId);
      if (r.action === 'create') batch.set(ref, r.write, { merge: false });
      else batch.set(ref, r.write, { merge: true });
    }
    await batch.commit();
  }
  // A number that arrives as opted out joins the suppression list, so no later import can lift it.
  for (const r of writes) {
    const marketing = (r.write.consent as { marketing?: { status?: string; source?: string | null } } | undefined)?.marketing;
    if (marketing?.status === 'opted_out') {
      await db.collection(SUPPRESSIONS).doc(r.customerId).set({ customerId: r.customerId, source: marketing.source ?? 'import', at: nowIso, createdAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  }
  const importRef = db.collection(IMPORTS).doc();
  const summary = summarise(plan);
  await importRef.set({
    id: importRef.id,
    actorUid: input.actorUid,
    createdAt: nowIso,
    strategy: plan.strategy,
    // Counts only: an import record never holds names, numbers or evidence.
    counts: plan.counts,
    invalidRows: plan.issues.length,
  });
  return { importId: importRef.id, created: plan.counts.create, updated: plan.counts.update, skipped: plan.counts.skipExisting + plan.counts.duplicateInFile + plan.counts.unchanged, plan: summary };
}

export { recordMarketingOptOut };

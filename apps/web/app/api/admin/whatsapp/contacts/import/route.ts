import { NextResponse } from 'next/server';
import { CONFLICT_STRATEGIES, IMPORT_LIMITS, ImportFileError, type ConflictStrategy } from '@bro-pics/shared';
import { buildPlan, commitImport, PlanChangedError, summarise } from '@bro-pics/shared/src/whatsapp/contact-import-service';
import { billingDb, guard } from '../../../../../../lib/billing/server';
import { adminApiError } from '../../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../../lib/audit-log';

/**
 * POST { csv, strategy, commit?, expect? }
 *  - commit absent/false: a DRY RUN. Parses, validates and plans; writes nothing; returns counts, a masked sample, row
 *    problems and a safe report.
 *  - commit true: needs `expect` (the create/update counts the admin just saw). The plan is recomputed here from the file and
 *    the database; if it differs, nothing is written (409). Counts only go to the audit log, never names or numbers.
 * Permission: whatsapp:contacts_import (administrators). Consent is never assumed: see packages/shared/src/whatsapp/contact-import.ts.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, 'whatsapp:contacts_import');
  if (!g.ok) return g.response;
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > IMPORT_LIMITS.maxBytes * 1.5) return adminApiError(413, 'invalid_request', 'The file is too large. Split it into smaller files.');
  const body = (await request.json().catch(() => null)) as { csv?: unknown; strategy?: unknown; commit?: unknown; expect?: { create?: unknown; update?: unknown } } | null;
  if (!body || typeof body.csv !== 'string') return adminApiError(400, 'invalid_request', 'Send the CSV text as "csv".');
  const strategy = (typeof body.strategy === 'string' ? body.strategy : 'skip_existing') as ConflictStrategy;
  if (!CONFLICT_STRATEGIES.includes(strategy)) return adminApiError(400, 'invalid_request', 'Unknown conflict strategy.');
  const db = billingDb();

  try {
    if (body.commit !== true) {
      return NextResponse.json({ dryRun: true, plan: summarise(await buildPlan(db, body.csv, strategy)) }, { status: 200 });
    }
    const create = body.expect?.create;
    const update = body.expect?.update;
    if (typeof create !== 'number' || typeof update !== 'number') return adminApiError(400, 'invalid_request', 'Run the preview first and confirm what it showed.');
    const result = await commitImport(db, { csv: body.csv, strategy, actorUid: g.uid, expect: { create, update } });
    await writeAuditLog(db, { actorUid: g.uid, action: 'whatsapp.contacts_import', resource: 'whatsappImport', resourceId: result.importId, details: { strategy, ...result.plan.counts } }).catch(() => undefined);
    return NextResponse.json({ imported: true, importId: result.importId, created: result.created, updated: result.updated, skipped: result.skipped, plan: result.plan }, { status: 200 });
  } catch (err) {
    if (err instanceof ImportFileError) return adminApiError(400, 'invalid_request', err.message);
    if (err instanceof PlanChangedError) return adminApiError(409, 'conflict', err.message);
    if (err instanceof Error && /Missing the|Unknown conflict/.test(err.message)) return adminApiError(400, 'invalid_request', err.message);
    throw err;
  }
}

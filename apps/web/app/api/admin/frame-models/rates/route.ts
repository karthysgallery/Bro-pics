import { NextResponse } from 'next/server';
import { FramingCostRatesSchema, logger } from '@bro-pics/shared';
import { catalogueGuard } from '../../../../../lib/catalogue/guard';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';

/** The shop's making-cost rates (print, glass, backing per sq ft; per-frame cost). Private: never on a public doc. */
export async function PUT(request: Request): Promise<NextResponse> {
  const g = await catalogueGuard(request, 'catalogue:write');
  if (!g.ok) return g.response;
  const parsed = FramingCostRatesSchema.strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return adminApiError(400, 'invalid_request', 'Enter each rate as a whole number of paise, 0 or more.', { issues: parsed.error.issues });
  await g.db.collection('adminSettings').doc('framingCosts').set({ ...parsed.data, updatedAt: new Date().toISOString() });
  await writeAuditLog(g.db, { actorUid: g.uid, action: 'framing_costs.update', resource: 'adminSettings', resourceId: 'framingCosts', details: parsed.data }).catch((error) =>
    logger.error('Failed to write audit log', { error: String(error) })
  );
  return NextResponse.json({ rates: parsed.data });
}

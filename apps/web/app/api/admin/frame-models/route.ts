import { NextResponse } from 'next/server';
import { FrameModelInputSchema, FrameModelSchema, logger } from '@bro-pics/shared';
import { catalogueGuard } from '../../../../lib/catalogue/guard';
import { FRAME_MODELS, frameModelIdFrom, listFrameModels, readFramingCostRates } from '../../../../lib/catalogue/frame-models';
import { adminApiError } from '../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../lib/audit-log';

/** Admin → Frame models: the shop's moulding library (with private cost) and the making-cost rates. */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await catalogueGuard(request, 'catalogue:read');
  if (!g.ok) return g.response;
  const [models, rates] = await Promise.all([listFrameModels(g.db, { includeInactive: true }), readFramingCostRates(g.db)]);
  // How many products offer each model, so the owner sees what an edit affects.
  const products = await g.db.collection('products').select('frameModelIds').get();
  const usage: Record<string, number> = {};
  for (const p of products.docs) for (const id of (p.get('frameModelIds') as string[] | undefined) ?? []) usage[id] = (usage[id] ?? 0) + 1;
  return NextResponse.json({ models, rates, usage });
}

export async function POST(request: Request): Promise<NextResponse> {
  const g = await catalogueGuard(request, 'catalogue:write');
  if (!g.ok) return g.response;
  const parsed = FrameModelInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return adminApiError(400, 'invalid_request', parsed.error.issues[0]?.message ?? 'Invalid frame model', { issues: parsed.error.issues });
  const existing = await g.db.collection(FRAME_MODELS).get();
  if (existing.docs.some((d) => String(d.get('code')).toLowerCase() === parsed.data.code.toLowerCase())) {
    return adminApiError(409, 'conflict', `Another frame model already uses the code ${parsed.data.code}.`);
  }
  const id = frameModelIdFrom(parsed.data.name, new Set(existing.docs.map((d) => d.id)));
  const now = new Date().toISOString();
  const model = FrameModelSchema.parse({ ...parsed.data, id, createdAt: now, updatedAt: now });
  await g.db.collection(FRAME_MODELS).doc(id).set(model);
  await writeAuditLog(g.db, { actorUid: g.uid, action: 'frame_model.create', resource: 'frameModel', resourceId: id, details: { name: model.name, code: model.code } }).catch((error) =>
    logger.error('Failed to write audit log', { id, error: String(error) })
  );
  return NextResponse.json({ model }, { status: 201 });
}

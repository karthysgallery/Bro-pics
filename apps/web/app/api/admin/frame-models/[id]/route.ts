import { NextResponse } from 'next/server';
import { FrameModelInputSchema, FrameModelSchema, logger } from '@bro-pics/shared';
import { catalogueGuard } from '../../../../../lib/catalogue/guard';
import { FRAME_MODELS } from '../../../../../lib/catalogue/frame-models';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Edit a frame model. Its name and material are copied onto product sizes when a
 * product is saved, so a rename shows on the shop after each product's next save.
 * There is no delete: switch a model off (isActive) so past orders keep their record.
 */
export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const g = await catalogueGuard(request, 'catalogue:write');
  if (!g.ok) return g.response;
  const { id } = await params;
  const ref = g.db.collection(FRAME_MODELS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return adminApiError(404, 'not_found', 'This frame model no longer exists.');
  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  // The id and dates belong to the server; a client that echoes them back is not refused for it.
  if (raw && typeof raw === 'object') for (const key of ['id', 'createdAt', 'updatedAt']) delete raw[key];
  const parsed = FrameModelInputSchema.partial().strict().safeParse(raw);
  if (!parsed.success) return adminApiError(400, 'invalid_request', parsed.error.issues[0]?.message ?? 'Invalid frame model', { issues: parsed.error.issues });
  if (parsed.data.code) {
    const clash = await g.db.collection(FRAME_MODELS).where('code', '==', parsed.data.code).get();
    if (clash.docs.some((d) => d.id !== id)) return adminApiError(409, 'conflict', `Another frame model already uses the code ${parsed.data.code}.`);
  }
  const model = FrameModelSchema.parse({ ...snap.data(), ...parsed.data, id, updatedAt: new Date().toISOString() });
  await ref.set(model);
  await writeAuditLog(g.db, { actorUid: g.uid, action: 'frame_model.update', resource: 'frameModel', resourceId: id, details: { fields: Object.keys(parsed.data) } }).catch((error) =>
    logger.error('Failed to write audit log', { id, error: String(error) })
  );
  return NextResponse.json({ model });
}

import { NextResponse } from 'next/server';
import { logger } from '@bro-pics/shared';
import { catalogueGuard } from '../../../../../../lib/catalogue/guard';
import { describeSetupIssue, loadProductSetup, ProductSetupBodySchema, saveProductSetup, SetupError } from '../../../../../../lib/catalogue/product-setup';
import { storageArtworkStore } from '../../../../../../lib/catalogue/artwork-store';
import { adminApiError } from '../../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../../lib/audit-log';
import { revalidateCategoryPage, revalidateHomepage, revalidateProductPage } from '../../../../../../lib/revalidate-catalogue';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const setupError = (err: unknown) => {
  if (err instanceof SetupError) return adminApiError(err.status, err.status === 404 ? 'not_found' : err.status === 409 ? 'conflict' : 'invalid_request', err.message);
  logger.error('Product setup failed', { error: String(err) });
  return adminApiError(500, 'internal', err instanceof Error ? err.message : 'The product could not be saved.');
};

/** The product as the guided editor edits it: details, size × frame model rows (with private cost), gallery. */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const g = await catalogueGuard(request, 'catalogue:read');
  if (!g.ok) return g.response;
  try {
    return NextResponse.json(await loadProductSetup(g.db, (await params).id));
  } catch (err) {
    return setupError(err);
  }
}

export async function PUT(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const g = await catalogueGuard(request, 'catalogue:write');
  if (!g.ok) return g.response;
  const { id } = await params;
  const raw = await request.json().catch(() => null);
  const parsed = ProductSetupBodySchema.safeParse(raw);
  if (!parsed.success) return adminApiError(400, 'invalid_request', describeSetupIssue(parsed.error.issues[0], raw), { issues: parsed.error.issues });
  try {
    const before = await g.db.collection('products').doc(id).get();
    const result = await saveProductSetup(g.db, storageArtworkStore(), id, parsed.data);
    await writeAuditLog(g.db, {
      actorUid: g.uid,
      action: parsed.data.status === 'archived' ? 'product.archive' : 'product.update',
      resource: 'product',
      resourceId: id,
      details: { type: parsed.data.productType, variants: result.variants },
    }).catch((error) => logger.error('Failed to write audit log', { error: String(error) }));
    const oldSlug = before.exists ? String(before.get('slug')) : null;
    if (oldSlug && oldSlug !== result.slug) revalidateProductPage(oldSlug);
    revalidateProductPage(result.slug);
    const category = await g.db.collection('categories').doc(parsed.data.categoryId).get();
    if (category.exists) revalidateCategoryPage(String(category.get('slug')));
    revalidateHomepage();
    return NextResponse.json(result);
  } catch (err) {
    return setupError(err);
  }
}

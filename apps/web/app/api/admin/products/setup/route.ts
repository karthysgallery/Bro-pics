import { NextResponse } from 'next/server';
import { logger } from '@bro-pics/shared';
import { catalogueGuard } from '../../../../../lib/catalogue/guard';
import { ProductSetupBodySchema, saveProductSetup, SetupError } from '../../../../../lib/catalogue/product-setup';
import { storageArtworkStore } from '../../../../../lib/catalogue/artwork-store';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { revalidateCategoryPage, revalidateHomepage, revalidateProductPage } from '../../../../../lib/revalidate-catalogue';

/** Creates a product from the guided editor (details, sizes × frame models, photos, print design) in one go. */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await catalogueGuard(request, 'catalogue:write');
  if (!g.ok) return g.response;
  const parsed = ProductSetupBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return adminApiError(400, 'invalid_request', parsed.error.issues[0]?.message ?? 'Some details are missing.', { issues: parsed.error.issues });
  try {
    const result = await saveProductSetup(g.db, storageArtworkStore(), null, parsed.data);
    await writeAuditLog(g.db, { actorUid: g.uid, action: 'product.create', resource: 'product', resourceId: result.productId, details: { slug: result.slug, type: parsed.data.productType, variants: result.variants } }).catch((error) =>
      logger.error('Failed to write audit log', { error: String(error) })
    );
    revalidateProductPage(result.slug);
    const category = await g.db.collection('categories').doc(parsed.data.categoryId).get();
    if (category.exists) revalidateCategoryPage(String(category.get('slug')));
    revalidateHomepage();
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof SetupError) return adminApiError(err.status, err.status === 404 ? 'not_found' : err.status === 409 ? 'conflict' : 'invalid_request', err.message);
    logger.error('Product setup failed', { error: String(err) });
    return adminApiError(500, 'internal', err instanceof Error ? err.message : 'The product could not be saved.');
  }
}

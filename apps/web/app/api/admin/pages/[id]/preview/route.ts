import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../../lib/admin-api-error';
import { loadLegalValues } from '../../../../../../lib/legal-values';
import { sanitizeRichText } from '../../../../../../lib/sanitize-rich-text';
import { fillLegalTokens, pageStatus, publicationBlockers, unresolvedTokens, type Page } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * What a customer would see if this page were live now: the saved text with the business facts filled in, the
 * list of things still blocking publication, and the page's workflow status. Read-only; nothing is published.
 */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests, please try again shortly' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } });
  }
  const permission = await requirePermission(request, 'content:write');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Content write access required');
  }
  const { id } = await params;
  const snap = await getFirestore(getAdminApp()).collection('pages').doc(id).get();
  if (!snap.exists) return adminApiError(404, 'not_found', `Unknown page id: ${id}`);
  const page = snap.data() as Page;
  const filled = fillLegalTokens(page.bodyHtml, await loadLegalValues());
  return NextResponse.json({
    html: sanitizeRichText(filled),
    blockers: publicationBlockers(filled),
    missing: unresolvedTokens(filled),
    status: pageStatus(page),
  });
}

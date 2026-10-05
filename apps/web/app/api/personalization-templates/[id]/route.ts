import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { getLatestPublished, getTemplateVersion } from '../../../../lib/personalization-templates';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Storefront read. Without ?version: the newest PUBLISHED version (what a new
 * personalization uses). With ?version=N: that exact version, but only if it is
 * published or archived — an archived version must stay loadable so a saved cart
 * or an order still opens the design it was made with. Drafts and in-review
 * templates are never served here.
 */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'read');
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests, please try again shortly' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } });
  }
  const { id } = await params;
  const db = getFirestore(getAdminApp());
  const requested = new URL(request.url).searchParams.get('version');

  if (requested !== null) {
    if (!/^\d+$/.test(requested) || Number(requested) < 1) return NextResponse.json({ error: 'Invalid version' }, { status: 400 });
    const template = await getTemplateVersion(db, id, Number(requested));
    if (!template || (template.status !== 'published' && template.status !== 'archived')) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }
    return NextResponse.json(template, { status: 200 });
  }

  const template = await getLatestPublished(db, id);
  return template ? NextResponse.json(template, { status: 200 }) : NextResponse.json({ error: 'Template not found' }, { status: 404 });
}

import { NextResponse } from 'next/server';
import { getStorage } from 'firebase-admin/storage';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { UploadUrlRequestSchema } from './upload-url-request-schema';

const UPLOAD_URL_TTL_MS = 15 * 60 * 1000;

// A Storage object path is not a safe place for arbitrary filename
// characters (path separators, encoding surprises) — keep only what's
// needed to make the stored file recognizable to a human browsing the
// bucket directly; the doc's own `alt`/`tags` are the real metadata.
function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
}

/**
 * [ABE-10] Step 1 of the "signed direct upload" flow the task asks for:
 * mint a signed WRITE url the admin's browser PUTs the file bytes to
 * directly, bypassing this Next.js server entirely (unlike
 * /api/uploads, which buffers the whole file server-side — fine for a
 * 40 MB customer photo, wasteful for a media-library video). The caller
 * then POSTs the resulting `path` to /api/admin/media to create the
 * Firestore doc — this route never touches the file's bytes, so it
 * can't know real dimensions; those come from the client.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'content:write');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Content write access required');
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = UploadUrlRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return adminApiError(400, 'invalid_request', 'Invalid upload-url request', { issues: parsed.error.issues });
  }
  const { fileName, contentType } = parsed.data;

  const path = `public/media/${crypto.randomUUID()}-${sanitizeFileName(fileName)}`;
  const bucket = getStorage(getAdminApp()).bucket();
  const [uploadUrl] = await bucket.file(path).getSignedUrl({
    action: 'write',
    expires: Date.now() + UPLOAD_URL_TTL_MS,
    contentType,
  });

  return NextResponse.json({ uploadUrl, path }, { status: 200 });
}

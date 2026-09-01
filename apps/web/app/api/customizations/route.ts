import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../lib/firebase-admin';
import { findVariantById } from '../../../lib/variant-lookup';
import { CustomizationSchema } from '@bro-pics/shared';
import { effectiveDpiFromCropRect } from '@bro-pics/shared';
import type { Upload } from '@bro-pics/shared';

export async function POST(request: Request): Promise<NextResponse> {
  // Require X-Session-Id the same way /api/uploads and /api/uploads/preview
  // do — a client-supplied `sessionId` in the JSON body is never trusted;
  // the header is the sole source of truth. See Finding 6 in review.
  const sessionId = request.headers.get('X-Session-Id');
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing X-Session-Id header' }, { status: 400 });
  }

  const body = await request.json();
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { uploadId, variantId, transformJson } = body as Record<string, unknown>;
  if (typeof uploadId !== 'string' || typeof variantId !== 'string' || !transformJson || typeof transformJson !== 'object') {
    return NextResponse.json({ error: 'Missing uploadId, variantId, or transformJson' }, { status: 400 });
  }
  const cropRect = (transformJson as Record<string, unknown>).cropRect as
    | { width: number; height: number }
    | undefined;
  if (!cropRect || typeof cropRect.width !== 'number' || typeof cropRect.height !== 'number') {
    return NextResponse.json({ error: 'Missing transformJson.cropRect' }, { status: 400 });
  }

  const db = getFirestore(getAdminApp());

  // The upload must exist and must belong to THIS session — never trust
  // that the client's uploadId actually belongs to the caller.
  const uploadDoc = await db.collection('uploads').doc(uploadId).get();
  if (!uploadDoc.exists) {
    return NextResponse.json({ error: `Unknown uploadId: ${uploadId}` }, { status: 400 });
  }
  const upload = uploadDoc.data() as Upload;
  if (upload.sessionId !== sessionId) {
    return NextResponse.json({ error: 'Upload does not belong to this session' }, { status: 403 });
  }

  const variant = await findVariantById(db, variantId);
  if (!variant) {
    return NextResponse.json({ error: `Unknown variantId: ${variantId}` }, { status: 400 });
  }

  // effectiveDpi is ALWAYS server-recomputed from the server-trusted
  // upload dimensions and variant print size — never taken from the
  // client's own claimed value. This is the same rule /api/uploads already
  // enforces for minUploadPx, applied one layer downstream. See Finding 6.
  //
  // Known residual (documented, not fixed here per the review's scoped
  // fix): cropRect itself is still client-supplied, so a client that
  // understates its crop can still report a higher effectiveDpi than the
  // photo it actually positioned. Closing that gap fully would require the
  // server to independently reconstruct the crop from the editor's raw
  // scale/offset/rotation state (which IS already stored in transformJson)
  // rather than trusting the client-computed cropRect — a good follow-up,
  // out of scope for this fix wave.
  const { effectiveDpi } = effectiveDpiFromCropRect(
    upload.widthPx,
    upload.heightPx,
    cropRect,
    variant.widthIn,
    variant.heightIn
  );

  const docRef = db.collection('customizations').doc();

  const parsed = CustomizationSchema.safeParse({
    ...body,
    id: docRef.id,
    sessionId,
    effectiveDpi,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid customization payload', issues: parsed.error.issues }, { status: 400 });
  }

  await docRef.set(parsed.data);
  return NextResponse.json(parsed.data, { status: 200 });
}

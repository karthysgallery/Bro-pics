import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../lib/firebase-admin';
import { findVariantById } from '../../../lib/variant-lookup';
import { getUserIdFromAuthHeader } from '../../../lib/verify-id-token';
import { CustomizationSchema } from '@bro-pics/shared';
import { effectiveDpiFromCropRect, printDimensionsForRotation } from '@bro-pics/shared';
import type { Upload } from '@bro-pics/shared';

export async function POST(request: Request): Promise<NextResponse> {
  // Require X-Session-Id the same way /api/uploads and /api/uploads/preview
  // do — a client-supplied `sessionId` in the JSON body is never trusted;
  // the header is the sole source of truth. See Finding 6 in review.
  const sessionId = request.headers.get('X-Session-Id');
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing X-Session-Id header' }, { status: 400 });
  }
  const userId = await getUserIdFromAuthHeader(request);

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
  // /api/uploads persists rejected (too-small, 422) uploads to Firestore
  // with a real id and returns that id in the response body — a client
  // could otherwise reference a rejected upload's id here, bypassing the
  // resolution-quality gate entirely. See Finding 3 in the second-round
  // review.
  if (upload.status !== 'ready') {
    return NextResponse.json({ error: `Upload ${uploadId} is not ready (status: ${upload.status})` }, { status: 400 });
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
  // At 90°/270° the crop rect's width/height axes (in the ORIGINAL image's
  // own pixel space) are swapped relative to the print's physical
  // width/height axes — a 90°-rotated photo's "width" in image-space maps
  // to the print's HEIGHT axis. Not swapping variant.widthIn/heightIn to
  // match produces up to a 50% DPI over-report at those rotations. See
  // Finding 4 in the second-round review.
  const rotationDeg = (transformJson as Record<string, unknown>).rotationDeg;
  const { printWidthIn, printHeightIn } = printDimensionsForRotation(
    variant,
    typeof rotationDeg === 'number' ? rotationDeg : 0
  );

  const { effectiveDpi } = effectiveDpiFromCropRect(
    upload.widthPx,
    upload.heightPx,
    cropRect,
    printWidthIn,
    printHeightIn
  );

  const docRef = db.collection('customizations').doc();

  const parsed = CustomizationSchema.safeParse({
    ...body,
    id: docRef.id,
    sessionId,
    effectiveDpi,
    ...(userId && { userId }),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid customization payload', issues: parsed.error.issues }, { status: 400 });
  }

  await docRef.set(parsed.data);
  return NextResponse.json(parsed.data, { status: 200 });
}

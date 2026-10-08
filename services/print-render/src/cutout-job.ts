import type { Cutout } from './background-removal';

/**
 * Makes the background-removed copy of a customer's upload and stores it as
 * an upload of its own (a transparent PNG next to the original), so every
 * other part of the system — editor, cart, order checks, print — treats it
 * like any photo. The original keeps a link to it, so it is made only once.
 * Dependencies are injected so the logic is testable without Firestore.
 */

export interface CutoutUploadRecord {
  id: string;
  sessionId: string;
  userId?: string;
  originalPath: string;
  widthPx: number;
  heightPx: number;
  status: 'ready' | 'rejected';
  cutoutOf?: string;
  cutoutUploadId?: string;
}

export interface CutoutDependencies {
  getUpload(uploadId: string): Promise<CutoutUploadRecord | null>;
  download(path: string): Promise<Buffer>;
  saveFile(path: string, data: Buffer, contentType: string): Promise<void>;
  newUploadId(): string;
  /** Creates the new upload record (same shape as a customer upload). */
  createUpload(record: Record<string, unknown>): Promise<void>;
  linkCutout(originalId: string, cutoutId: string): Promise<void>;
  removeBackground(image: Buffer): Promise<Cutout>;
  now(): Date;
}

export class CutoutError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: 'not_found' | 'not_ready' | 'no_subject',
    message: string
  ) {
    super(message);
    this.name = 'CutoutError';
  }
}

export interface CutoutResult {
  uploadId: string;
  widthPx: number;
  heightPx: number;
  /** True when an earlier cut-out of the same photo was reused. */
  reused: boolean;
}

/** Below this share of the picture kept, nothing was recognised as the subject. */
const MIN_SUBJECT_SHARE = 0.01;

export async function createCutout(deps: CutoutDependencies, uploadId: string): Promise<CutoutResult> {
  const upload = await deps.getUpload(uploadId);
  if (!upload) throw new CutoutError(404, 'not_found', 'That photo could not be found.');
  if (upload.status !== 'ready') throw new CutoutError(409, 'not_ready', 'That photo is not ready yet.');
  if (upload.cutoutOf) return { uploadId: upload.id, widthPx: upload.widthPx, heightPx: upload.heightPx, reused: true };

  if (upload.cutoutUploadId) {
    const existing = await deps.getUpload(upload.cutoutUploadId);
    if (existing && existing.status === 'ready') return { uploadId: existing.id, widthPx: existing.widthPx, heightPx: existing.heightPx, reused: true };
  }

  const cut = await deps.removeBackground(await deps.download(upload.originalPath));
  if (cut.subjectShare < MIN_SUBJECT_SHARE) {
    throw new CutoutError(422, 'no_subject', 'No people or main subject were found in this photo, so the background could not be removed.');
  }

  const id = deps.newUploadId();
  const path = `uploads/${upload.sessionId}/${id}/original.png`;
  await deps.saveFile(path, cut.png, 'image/png');
  await deps.createUpload({
    id,
    sessionId: upload.sessionId,
    ...(upload.userId && { userId: upload.userId }),
    originalPath: path,
    widthPx: cut.width,
    heightPx: cut.height,
    mime: 'image/png',
    bytes: cut.png.length,
    exifStripped: true,
    status: 'ready',
    createdAt: deps.now(),
    cutoutOf: upload.id,
  });
  await deps.linkCutout(upload.id, id);
  return { uploadId: id, widthPx: cut.width, heightPx: cut.height, reused: false };
}

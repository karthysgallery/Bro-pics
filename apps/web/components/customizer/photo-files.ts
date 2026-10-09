'use client';

/**
 * Getting a customer's photo into the editor: a downscaled local copy to draw
 * from straight away (a 40 MB phone photo decoded 20 times over would crash a
 * phone's browser), and the original uploaded in the background through the
 * same POST /api/uploads the classic editor uses.
 */

/** Long side of the copy the editor draws from. The print always uses the original. */
export const EDITOR_PHOTO_SIDE = 2000;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export interface LocalPhoto {
  /** blob: URL of the downscaled copy. */
  src: string;
  /** The ORIGINAL's size after EXIF orientation — what the server will report too. */
  width: number;
  height: number;
}

export class PhotoError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'PhotoError';
  }
}

export const UPLOAD_ERROR_MESSAGES: Record<string, string> = {
  file_too_large: 'This photo is too large. Use a file under 25 MB.',
  not_an_image: 'This file is not a photo. Use a JPEG, PNG or WebP image.',
  decode_timeout: 'This photo took too long to process. Try a smaller file.',
  decode_failed: "This photo couldn't be read. It may be damaged or in an unsupported format.",
  rate_limited: 'Too many photos at once. Wait a moment and try again.',
  unknown_variant: 'This frame size is no longer available. Reload the page.',
  network: 'The upload failed. Check your connection and try again.',
};

export function uploadErrorMessage(code: string): string {
  return UPLOAD_ERROR_MESSAGES[code] ?? "This photo couldn't be uploaded. Try a different file.";
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      // 'from-image' applies EXIF orientation, matching the server's auto-orient.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // Fall through to <img>, which some browsers decode more formats with.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new PhotoError('decode_failed', uploadErrorMessage('decode_failed'));
  }
}

/** Decodes a chosen file and makes the editor's working copy of it. */
export async function prepareLocalPhoto(file: File, maxSide = EDITOR_PHOTO_SIDE): Promise<LocalPhoto> {
  if (file.size > MAX_UPLOAD_BYTES) throw new PhotoError('file_too_large', uploadErrorMessage('file_too_large'));
  if (file.type && !file.type.startsWith('image/')) throw new PhotoError('not_an_image', uploadErrorMessage('not_an_image'));
  const decoded = await decode(file);
  try {
    const { width, height } = decoded;
    if (!width || !height) throw new PhotoError('decode_failed', uploadErrorMessage('decode_failed'));
    const k = Math.min(1, maxSide / Math.max(width, height));
    if (k === 1) return { src: URL.createObjectURL(file), width, height };
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * k));
    canvas.height = Math.max(1, Math.round(height * k));
    const ctx = canvas.getContext('2d');
    if (!ctx) return { src: URL.createObjectURL(file), width, height };
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    return { src: blob ? URL.createObjectURL(blob) : URL.createObjectURL(file), width, height };
  } finally {
    decoded.close();
  }
}

export interface UploadedPhoto {
  id: string;
  width: number;
  height: number;
}

export interface UploadContext {
  variantId: string;
  sessionId: string;
  authToken?: string | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * POST /api/uploads. Waits out a rate limit (Retry-After) a few times rather
 * than failing a big collage half way through.
 */
export async function uploadPhoto(file: File, ctx: UploadContext, fetchImpl: typeof fetch = fetch): Promise<UploadedPhoto> {
  for (let attempt = 0; ; attempt++) {
    const form = new FormData();
    form.append('file', file);
    form.append('variantId', ctx.variantId);
    let res: Response;
    try {
      res = await fetchImpl('/api/uploads', {
        method: 'POST',
        headers: { 'X-Session-Id': ctx.sessionId, ...(ctx.authToken && { Authorization: `Bearer ${ctx.authToken}` }) },
        body: form,
      });
    } catch {
      throw new PhotoError('network', uploadErrorMessage('network'));
    }
    const body = (await res.json().catch(() => ({}))) as { code?: string; id?: string; widthPx?: number; heightPx?: number; status?: string };
    if (res.status === 429 && attempt < 4) {
      const wait = Number(res.headers.get('Retry-After')) || 5;
      await sleep(Math.min(60, wait) * 1000);
      continue;
    }
    if (!res.ok) {
      const code = body.code ?? (res.status === 429 ? 'rate_limited' : 'upload_failed');
      throw new PhotoError(code, uploadErrorMessage(code));
    }
    if (body.status !== 'ready' || !body.id || !body.widthPx || !body.heightPx) {
      throw new PhotoError('decode_failed', uploadErrorMessage('decode_failed'));
    }
    return { id: body.id, width: body.widthPx, height: body.heightPx };
  }
}

/**
 * Asks the server for the background-removed copy of an uploaded photo (for a
 * "cut out" photo space). Returns the copy's upload; when the photo is already
 * a cut-out, the same upload comes back.
 */
export async function requestCutout(
  uploadId: string,
  ctx: Omit<UploadContext, 'variantId'>,
  fetchImpl: typeof fetch = fetch
): Promise<UploadedPhoto & { subjectBox?: { x: number; y: number; width: number; height: number } }> {
  let res: Response;
  try {
    res = await fetchImpl(`/api/uploads/${encodeURIComponent(uploadId)}/cutout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Id': ctx.sessionId, ...(ctx.authToken && { Authorization: `Bearer ${ctx.authToken}` }) },
      body: '{}',
    });
  } catch {
    throw new PhotoError('cutout_failed', 'The background could not be removed (no connection), so your photo is used as it is.');
  }
  const body = (await res.json().catch(() => ({}))) as {
    uploadId?: string;
    widthPx?: number;
    heightPx?: number;
    subjectBox?: { x: number; y: number; width: number; height: number };
    code?: string;
  };
  if (res.ok && body.uploadId && body.widthPx && body.heightPx) {
    return { id: body.uploadId, width: body.widthPx, height: body.heightPx, ...(body.subjectBox && { subjectBox: body.subjectBox }) };
  }
  if (body.code === 'no_subject') throw new PhotoError('no_subject', 'No people were found in this photo, so its background was kept.');
  throw new PhotoError('cutout_failed', 'The background could not be removed right now, so your photo is used as it is.');
}

/** Runs async jobs a few at a time, in the order they were queued. */
export function createTaskQueue(concurrency = 3) {
  let running = 0;
  const waiting: Array<() => void> = [];
  const next = () => {
    if (running >= concurrency) return;
    const start = waiting.shift();
    if (start) start();
  };
  return function enqueue<T>(job: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      waiting.push(() => {
        running++;
        job()
          .then(resolve, reject)
          .finally(() => {
            running--;
            next();
          });
      });
      next();
    });
  };
}

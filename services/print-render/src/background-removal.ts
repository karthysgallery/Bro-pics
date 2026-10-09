import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import type { InferenceSession } from 'onnxruntime-node';

/**
 * Cuts the people (or main subject) out of a photo: everything else becomes
 * transparent. Runs BiRefNet-lite (MIT licence, code and weights) in this
 * service through ONNX Runtime — no outside service, no per-photo cost.
 * It needs about 6 GB of memory while it runs, which is why it lives here
 * (a private service sized for heavy image work) and not in the website.
 *
 * The model sees the photo at 1024×1024; its soft mask is scaled back up to
 * the photo's full size and used as the alpha channel, so the colours stay
 * the original's own pixels at full print resolution.
 */

const MODEL_SIDE = 1024;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
/** Larger photos are scaled down first: plenty for a 300 DPI print, and it bounds memory. */
export const CUTOUT_MAX_SIDE = 5000;

export class CutoutUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CutoutUnavailableError';
  }
}

/** Where the model file lives: CUTOUT_MODEL_PATH, else models/ next to src/ or lib/ (fetched by `node fetch-model.mjs`). */
export function cutoutModelPath(): string {
  return process.env.CUTOUT_MODEL_PATH
    ? resolve(process.env.CUTOUT_MODEL_PATH)
    : resolve(join(dirname(fileURLToPath(import.meta.url)), '..', 'models', 'birefnet-lite.onnx'));
}

export function cutoutModelPresent(): boolean {
  return existsSync(cutoutModelPath());
}

let sessionPromise: Promise<InferenceSession> | null = null;

function loadSession(): Promise<InferenceSession> {
  if (!sessionPromise) {
    const path = cutoutModelPath();
    if (!existsSync(path)) return Promise.reject(new CutoutUnavailableError(`Background removal model not found at ${path}`));
    sessionPromise = import('onnxruntime-node')
      .then((ort) => ort.InferenceSession.create(path, { graphOptimizationLevel: 'all', executionMode: 'sequential' }))
      .catch((err: unknown) => {
        sessionPromise = null;
        throw new CutoutUnavailableError(`Background removal model could not be loaded: ${err instanceof Error ? err.message : String(err)}`);
      });
  }
  return sessionPromise;
}

// One cut-out at a time per instance: each one briefly needs ~6 GB, so running
// several together could exhaust the instance's memory.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

export interface Cutout {
  /** RGBA PNG at the photo's own size (after EXIF rotation and the size cap). */
  png: Buffer;
  width: number;
  height: number;
  /** Share of the picture kept (0..1): near 0 means nothing was recognised as the subject. */
  subjectShare: number;
  /** Bounding box of what was kept, as fractions of the image (null when nothing was kept). */
  subjectBox: { x: number; y: number; width: number; height: number } | null;
}

/** The model's 1024×1024 soft mask (0-255) for a photo. */
async function predictMask(rgb: Buffer): Promise<Uint8Array> {
  const session = await loadSession();
  const ort = await import('onnxruntime-node');
  const plane = MODEL_SIDE * MODEL_SIDE;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) input[c * plane + i] = (rgb[i * 3 + c]! / 255 - MEAN[c]!) / STD[c]!;
  }
  const feeds = { [session.inputNames[0]!]: new ort.Tensor('float32', input, [1, 3, MODEL_SIDE, MODEL_SIDE]) };
  const results = await session.run(feeds);
  // The final (finest) prediction is the last output.
  const output = results[session.outputNames[session.outputNames.length - 1]!]!;
  const logits = output.data as Float32Array;
  const mask = new Uint8Array(plane);
  // The export emits logits; squash them to 0..1 (a no-op shape if they are already probabilities).
  const needsSigmoid = logits.some((v) => v < 0 || v > 1);
  for (let i = 0; i < plane; i++) {
    const p = needsSigmoid ? 1 / (1 + Math.exp(-logits[i]!)) : logits[i]!;
    mask[i] = Math.round(Math.min(1, Math.max(0, p)) * 255);
  }
  return mask;
}

export function removeBackground(image: Buffer): Promise<Cutout> {
  return serial(async () => {
    const meta = await sharp(image).rotate().metadata();
    const turned = (meta.orientation ?? 1) >= 5;
    let width = turned ? meta.height! : meta.width!;
    let height = turned ? meta.width! : meta.height!;
    if (!width || !height) throw new Error('The file is not a readable image.');
    const k = Math.min(1, CUTOUT_MAX_SIDE / Math.max(width, height));
    width = Math.max(1, Math.round(width * k));
    height = Math.max(1, Math.round(height * k));

    const photo = await sharp(image, { limitInputPixels: false }).rotate().resize(width, height, { fit: 'fill' }).removeAlpha().raw().toBuffer();
    const small = await sharp(photo, { raw: { width, height, channels: 3 } }).resize(MODEL_SIDE, MODEL_SIDE, { fit: 'fill', kernel: 'cubic' }).raw().toBuffer();
    const mask = await predictMask(small);

    const alpha = await sharp(Buffer.from(mask), { raw: { width: MODEL_SIDE, height: MODEL_SIDE, channels: 1 } })
      .resize(width, height, { fit: 'fill', kernel: 'cubic' })
      .extractChannel(0)
      .raw()
      .toBuffer();
    // Interleave by hand: photo RGB + mask as alpha.
    const rgba = Buffer.alloc(width * height * 4);
    let kept = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let i = 0, n = width * height; i < n; i++) {
      rgba[i * 4] = photo[i * 3]!;
      rgba[i * 4 + 1] = photo[i * 3 + 1]!;
      rgba[i * 4 + 2] = photo[i * 3 + 2]!;
      const a = alpha[i]!;
      rgba[i * 4 + 3] = a;
      if (a > 127) {
        kept++;
        const x = i % width;
        const y = (i - x) / width;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    const subjectBox = maxX < 0 ? null : { x: minX / width, y: minY / height, width: (maxX + 1 - minX) / width, height: (maxY + 1 - minY) / height };
    const png = await sharp(rgba, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 6 }).toBuffer();
    return { png, width, height, subjectShare: kept / (width * height), subjectBox };
  });
}

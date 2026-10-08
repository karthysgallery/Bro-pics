// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('server-only', () => ({}));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

const mockDocGet = vi.hoisted(() => vi.fn());
const mockDocSet = vi.hoisted(() => vi.fn());
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: () => ({ doc: () => ({ id: 'cleaned_1', get: mockDocGet, set: mockDocSet }) }) }),
}));

const mockDownload = vi.hoisted(() => vi.fn());
const mockSave = vi.hoisted(() => vi.fn());
vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({ bucket: () => ({ file: (path: string) => ({ download: mockDownload, save: (...a: unknown[]) => mockSave(path, ...a) }) }) }),
}));

const mockPermission = vi.hoisted(() => vi.fn());
vi.mock('../../../../../lib/require-permission', () => ({ requirePermission: (...a: unknown[]) => mockPermission(...a) }));

import { POST } from './route';
import { resetRateLimitState } from '../../../../../lib/rate-limit';
import { planCanvas } from '../../../../../lib/collage-detection';

/** A 900×600 white design with two grey photo placeholders. */
async function twoPlaceholderDesign(): Promise<Buffer> {
  const w = 900;
  const h = 600;
  const data = Buffer.alloc(w * h * 4, 255);
  const box = (x0: number, y0: number, bw: number, bh: number) => {
    for (let y = y0; y < y0 + bh; y++)
      for (let x = x0; x < x0 + bw; x++) {
        const i = (y * w + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 190;
      }
  };
  box(60, 60, 360, 480);
  box(480, 60, 360, 480);
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

const req = (body: unknown) =>
  new Request('https://example.com/api/admin/personalization-templates/detect', {
    method: 'POST',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/admin/personalization-templates/detect', () => {
  beforeEach(async () => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockPermission.mockResolvedValue({ ok: true, uid: 'admin_1' });
    mockDocGet.mockResolvedValue({ exists: true, data: () => ({ id: 'm1', type: 'image', path: 'public/media/m1/collage.png', isActive: true }) });
    mockDownload.mockResolvedValue([await twoPlaceholderDesign()]);
  });

  it('requires catalogue write access', async () => {
    mockPermission.mockResolvedValue({ ok: false, status: 403 });
    expect((await POST(req({ mediaId: 'm1' }))).status).toBe(403);
    expect(mockDocGet).not.toHaveBeenCalled();
  });

  it('finds the photo areas and plans a print canvas at the frame size', async () => {
    const res = await POST(req({ mediaId: 'm1', widthIn: 12, heightIn: 8 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.detection.mode).toBe('opaque');
    expect(body.detection.slots).toHaveLength(2);
    // An RGBA PNG with every pixel opaque: no transparent windows, so the photos go over the placeholders.
    expect(body.artwork).toEqual({ assetId: 'm1', width: 900, height: 600, hasAlpha: true });
    expect(body.detection.artworkPlacement).toBe('below-photos');
    expect(body.canvas).toEqual({ width: 3600, height: 2400, dpi: 300 });
    // 900 px across 12 in is 75 DPI: the admin is told to upload a bigger file.
    expect(body.artworkDpi).toBe(75);
    expect(body.warnings.join(' ')).toMatch(/at least 3600 × 2400 px/);
  });

  it('maps a real sample collage: every photo on its grid, the main photo, and its wording as a text box', async () => {
    // The owner's reference design: 28 small photos round a large one, "FOREVER AND ALWAYS" under it,
    // on a softly shaded light grey (which the old single-colour background check could not read).
    mockDownload.mockResolvedValueOnce([readFileSync(join(__dirname, '../../../../../__fixtures__/collage-forever-and-always.webp'))]);
    const res = await POST(req({ mediaId: 'm1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const { slots, texts } = body.detection;
    expect(slots).toHaveLength(29);
    expect(slots.every((s: { shape: string }) => s.shape === 'rect')).toBe(true);
    // Five columns and eight rows of small photos share exact edges.
    expect(new Set(slots.map((s: { x: number }) => s.x.toFixed(4))).size).toBe(5);
    const area = (s: { width: number; height: number }) => s.width * s.height;
    const hero = [...slots].sort((a, b) => area(b) - area(a))[0];
    expect(area(hero)).toBeGreaterThan(8 * area(slots[0]));
    // One line of wording, just under the main photo, with the same centre.
    expect(texts).toHaveLength(1);
    expect(texts[0].y).toBeGreaterThanOrEqual(hero.y + hero.height);
    expect(texts[0].x + texts[0].width / 2).toBeCloseTo(hero.x + hero.width / 2, 1);
    // The design comes back with the wording cleared, saved as a new library image the template uses.
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave.mock.calls[0][0]).toMatch(/^public\/media\/cleaned_1-design-without-text\.jpg$/);
    expect(mockDocSet).toHaveBeenCalledWith(expect.objectContaining({ id: 'cleaned_1', type: 'image', isActive: true, tags: ['template-artwork'] }));
    expect(body.artwork).toMatchObject({ assetId: 'cleaned_1', originalAssetId: 'm1' });
  });

  it('keeps the photo spaces when the cleared copy cannot be saved', async () => {
    mockDownload.mockResolvedValueOnce([readFileSync(join(__dirname, '../../../../../__fixtures__/collage-forever-and-always.webp'))]);
    mockSave.mockRejectedValueOnce(new Error('storage down'));
    const body = await (await POST(req({ mediaId: 'm1' }))).json();
    expect(body.detection.slots).toHaveLength(29);
    expect(body.detection.texts).toEqual([]);
    expect(body.artwork.assetId).toBe('m1');
    expect(body.detection.notes.join(' ')).toMatch(/could not be cleared/);
  });

  it('rejects unknown media and half a print size', async () => {
    expect((await POST(req({ mediaId: 'm1', widthIn: 12 }))).status).toBe(400);
    mockDocGet.mockResolvedValueOnce({ exists: false });
    expect((await POST(req({ mediaId: 'nope' }))).status).toBe(404);
  });

  it('explains a file that is not an image', async () => {
    mockDownload.mockResolvedValueOnce([Buffer.from('not an image')]);
    const res = await POST(req({ mediaId: 'm1' }));
    expect(res.status).toBe(422);
  });
});

describe('planCanvas', () => {
  it('prints the design at its own size when no frame size is given', () => {
    const plan = planCanvas({ nativeWidth: 3000, nativeHeight: 2400 });
    expect(plan.canvas).toEqual({ width: 3000, height: 2400, dpi: 300 });
    expect(plan.warnings).toEqual([]);
  });

  it('turns a landscape print size to match a portrait design', () => {
    const plan = planCanvas({ nativeWidth: 2400, nativeHeight: 3600, widthIn: 12, heightIn: 8 });
    expect(plan.canvas).toEqual({ width: 2400, height: 3600, dpi: 300 });
    expect(plan.warnings).toEqual([]);
  });

  it('fits a design with other proportions inside the frame instead of stretching it', () => {
    const plan = planCanvas({ nativeWidth: 4000, nativeHeight: 4000, widthIn: 12, heightIn: 8 });
    expect(plan.canvas).toEqual({ width: 2400, height: 2400, dpi: 300 });
    expect(plan.warnings[0]).toMatch(/fitted inside/);
  });
});

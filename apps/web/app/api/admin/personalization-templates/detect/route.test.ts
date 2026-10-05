// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';

vi.mock('server-only', () => ({}));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

const mockDocGet = vi.hoisted(() => vi.fn());
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: () => ({ doc: () => ({ get: mockDocGet }) }) }),
}));

const mockDownload = vi.hoisted(() => vi.fn());
vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({ bucket: () => ({ file: () => ({ download: mockDownload }) }) }),
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

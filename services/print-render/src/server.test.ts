import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createServer } from './server';
import type { RenderJobDependencies } from './render-job';
import { PrintJobNotLeasableError } from '@bro-pics/shared/src/print-jobs/print-jobs';

class NotLeasable extends Error {}

function makeDeps(overrides: Partial<RenderJobDependencies> = {}): RenderJobDependencies {
  return {
    leaseJob: vi.fn().mockResolvedValue(undefined),
    failJob: vi.fn().mockResolvedValue(undefined),
    completeJobAndAdvanceOrder: vi.fn().mockResolvedValue(undefined),
    getPrintJob: vi.fn().mockResolvedValue(null),
    getOrderItem: vi.fn().mockResolvedValue(null),
    getVariant: vi.fn().mockResolvedValue(null),
    getCustomizationsForPersonalization: vi.fn().mockResolvedValue([]),
    getFrameTemplate: vi.fn().mockResolvedValue(null),
    getUpload: vi.fn().mockResolvedValue(null),
    fetchPublicAsset: vi.fn(),
    downloadPrivateFile: vi.fn(),
    uploadPrintFile: vi.fn(),
    markCustomizationsRendered: vi.fn(),
    markCustomizationsFailed: vi.fn(),
    ...overrides,
  };
}

describe('GET /health', () => {
  it('returns 200 with status ok and fonts status', async () => {
    const app = createServer(makeDeps());
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.fonts).toBeDefined();
  });
});

describe('POST /render/:jobId', () => {
  it('returns 409 when leasing throws @bro-pics/shared PrintJobNotLeasableError', async () => {
    const deps = makeDeps({ leaseJob: vi.fn().mockRejectedValue(new PrintJobNotLeasableError('not leasable')) });
    const app = createServer(deps);
    const response = await request(app).post('/render/order_1_item_1');
    expect(response.status).toBe(409);
  });

  it('returns 500, not 409, for an error that only resembles PrintJobNotLeasableError by name', async () => {
    // Proves the route checks `instanceof` against the real shared class
    // rather than catch-and-409'ing every thrown error.
    const deps = makeDeps({ leaseJob: vi.fn().mockRejectedValue(new NotLeasable('not leasable')) });
    const app = createServer(deps);
    const response = await request(app).post('/render/order_1_item_1');
    expect(response.status).toBe(500);
  });

  it('returns 500 with the error message when rendering fails for any other reason', async () => {
    const deps = makeDeps({
      leaseJob: vi.fn().mockResolvedValue(undefined),
      getPrintJob: vi.fn().mockResolvedValue(null),
      failJob: vi.fn().mockResolvedValue(undefined),
    });
    const app = createServer(deps);
    const response = await request(app).post('/render/order_1_item_1');
    expect(response.status).toBe(500);
    expect(response.body.error).toContain('not found immediately after leasing');
  });

  it('returns 200 on a successful render', async () => {
    const deps = makeDeps({
      leaseJob: vi.fn().mockResolvedValue(undefined),
      getPrintJob: vi.fn().mockResolvedValue({ orderId: 'order_1', itemId: 'item_1', personalizationId: 'p1' }),
      getOrderItem: vi.fn().mockResolvedValue({ variantId: 'variant_1' }),
      getVariant: vi.fn().mockResolvedValue({ printWidthPx: 10, printHeightPx: 10 }),
      getCustomizationsForPersonalization: vi.fn().mockResolvedValue([
        { id: 'cust_1', uploadId: 'upload_1', slotIndex: 0, templateVersion: 1, cropRect: { x: 0, y: 0, width: 4, height: 4 }, rotationDeg: 0 },
      ]),
      getFrameTemplate: vi.fn().mockResolvedValue({
        mockupUrl: 'https://cdn.example.com/mockup.png',
        maskUrl: null,
        overlayUrl: null,
        printableRects: [{ slotIndex: 0, x: 0, y: 0, width: 1, height: 1 }],
      }),
      getUpload: vi.fn().mockResolvedValue({ originalPath: 'uploads/session_1/photo.jpg' }),
      fetchPublicAsset: vi.fn().mockResolvedValue(await tinyPng()),
      downloadPrivateFile: vi.fn().mockResolvedValue(await tinyPng()),
      uploadPrintFile: vi.fn().mockResolvedValue('print-files/order_1/item_1/print.png'),
      markCustomizationsRendered: vi.fn().mockResolvedValue(undefined),
    });
    const app = createServer(deps);
    const response = await request(app).post('/render/order_1_item_1');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'done', jobId: 'order_1_item_1' });
  });
});

async function tinyPng(): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp(Buffer.alloc(4 * 4 * 4), { raw: { width: 4, height: 4, channels: 4 } }).png().toBuffer();
}

describe('POST /cutout/:uploadId', () => {
  const cutoutDeps = (removeBackground = vi.fn(async () => ({ png: Buffer.from('png'), width: 10, height: 10, subjectShare: 0.4, subjectBox: null }))) => ({
    getUpload: vi.fn(async (id: string) => (id === 'up_1' ? { id, sessionId: 's', originalPath: 'uploads/s/up_1/original.jpg', widthPx: 10, heightPx: 10, status: 'ready' as const } : null)),
    download: vi.fn(async () => Buffer.from('x')),
    saveFile: vi.fn(async () => undefined),
    newUploadId: () => 'cut_1',
    createUpload: vi.fn(async () => undefined),
    linkCutout: vi.fn(async () => undefined),
    removeBackground,
    now: () => new Date(),
  });

  it('returns the new upload, 404 for an unknown photo and 400 for a bad id', async () => {
    const app = createServer(makeDeps(), cutoutDeps());
    expect((await request(app).post('/cutout/up_1')).body).toEqual({ uploadId: 'cut_1', widthPx: 10, heightPx: 10, reused: false });
    expect((await request(app).post('/cutout/nope')).status).toBe(404);
    expect((await request(app).post('/cutout/a.b')).status).toBe(400);
  });

  it('answers 503 when the model is missing or the service has no cut-out wiring', async () => {
    const { CutoutUnavailableError } = await import('./background-removal');
    const app = createServer(makeDeps(), cutoutDeps(vi.fn(async () => Promise.reject(new CutoutUnavailableError('no model')))));
    expect((await request(app).post('/cutout/up_1')).status).toBe(503);
    expect((await request(createServer(makeDeps())).post('/cutout/up_1')).status).toBe(503);
  });
});

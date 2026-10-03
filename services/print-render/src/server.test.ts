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

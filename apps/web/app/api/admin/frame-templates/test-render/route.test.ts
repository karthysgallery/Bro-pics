import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockFindVariantById = vi.fn();
vi.mock('../../../../../lib/variant-lookup', () => ({ findVariantById: (...args: unknown[]) => mockFindVariantById(...args) }));

const mockProbeAndStripImage = vi.fn();
vi.mock('../../../../../lib/image-probe', () => ({ probeAndStripImage: (...args: unknown[]) => mockProbeAndStripImage(...args) }));

const mockRenderPrintFile = vi.fn();
vi.mock('@bro-pics/print-render/src/render-print-file', () => ({ renderPrintFile: (...args: unknown[]) => mockRenderPrintFile(...args) }));

const mockTemplateQueryGet = vi.fn();
const mockWhere = vi.fn(() => ({ where: mockWhere, limit: vi.fn(() => ({ get: mockTemplateQueryGet })) }));
const mockTemplatesRef = { where: mockWhere };
const mockDb = {
  collection: vi.fn(() => ({ doc: vi.fn(() => ({ collection: vi.fn(() => mockTemplatesRef) })) })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../../lib/rate-limit';

const currentTemplate = {
  id: 'tpl_1',
  variantId: 'var_1',
  version: 3,
  isCurrent: true,
  mockupUrl: 'https://storage.example.com/mockup.png',
  maskUrl: null,
  overlayUrl: null,
  printableRects: [{ slotIndex: 0, x: 0.1, y: 0.1, width: 0.8, height: 0.8 }],
};

// A real `new Request(url, { body: FormData })` round-tripped through
// `.formData()` proved flaky in this jsdom + Node-fetch test environment
// (undici's formData() parser intermittently failed to see the
// multipart Content-Type the Request constructor is supposed to set
// automatically for a FormData body — reproduced even matching the
// working pattern in app/api/uploads/route.test.ts byte-for-byte).
// Duck-typing the one surface the route actually calls (`.headers.get`
// and `.formData().get`) sidesteps that flakiness entirely and is just
// as faithful a test of the route's own logic.
function makeRequest(formEntries: Record<string, string | Blob>, authHeader = 'Bearer good-token'): Request {
  const map = new Map<string, string | Blob>(Object.entries(formEntries));
  return {
    headers: new Headers({ Authorization: authHeader }),
    formData: async () => ({ get: (key: string) => map.get(key) ?? null }),
  } as unknown as Request;
}

// jsdom's global Blob (this project's vitest environment) doesn't
// implement `.arrayBuffer()` — a real browser File/Blob, and Node's own
// Blob outside jsdom, both do. A plain object with the same shape the
// route actually reads avoids depending on that gap.
const samplePhoto = {
  size: 3,
  type: 'image/jpeg',
  arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
} as unknown as Blob;

describe('POST /api/admin/frame-templates/test-render', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockFindVariantById.mockResolvedValue({ id: 'var_1', productId: 'prod_1', printWidthPx: 2400, printHeightPx: 3000 });
    mockTemplateQueryGet.mockResolvedValue({ empty: false, docs: [{ data: () => currentTemplate }] });
    mockProbeAndStripImage.mockResolvedValue({ widthPx: 1000, heightPx: 800, mime: 'image/jpeg', strippedBuffer: Buffer.from('photo') });
    mockRenderPrintFile.mockResolvedValue(Buffer.from('rendered-png-bytes'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new Uint8Array([9, 9, 9]).buffer }));
  });

  it('returns 400 when photo is missing', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ variantId: 'var_1' }));
    expect(response.status).toBe(400);
  });

  it('returns 400 when the variant does not exist', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockFindVariantById.mockResolvedValueOnce(null);
    const response = await POST(makeRequest({ variantId: 'var_1', photo: samplePhoto }));
    expect(response.status).toBe(400);
  });

  it('returns 404 when no matching frame template exists', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    mockTemplateQueryGet.mockResolvedValueOnce({ empty: true, docs: [] });
    const response = await POST(makeRequest({ variantId: 'var_1', photo: samplePhoto }));
    expect(response.status).toBe(404);
  });

  it('queries by isCurrent when templateVersion is omitted', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest({ variantId: 'var_1', photo: samplePhoto }));
    expect(mockWhere).toHaveBeenCalledWith('isCurrent', '==', true);
  });

  it('queries by an explicit version when templateVersion is given', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest({ variantId: 'var_1', templateVersion: '2', photo: samplePhoto }));
    expect(mockWhere).toHaveBeenCalledWith('version', '==', 2);
  });

  it('returns the rendered PNG as a downloadable attachment', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ variantId: 'var_1', photo: samplePhoto }));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="test-render-var_1-v3.png"');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Buffer.from(bytes).toString()).toBe('rendered-png-bytes');
  });

  it('passes the full uncropped photo dimensions as cropRect for every slot, unrotated', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest({ variantId: 'var_1', photo: samplePhoto }));
    expect(mockRenderPrintFile).toHaveBeenCalledWith(
      expect.objectContaining({
        printWidthPx: 2400,
        printHeightPx: 3000,
        slots: [
          expect.objectContaining({
            cropRect: { x: 0, y: 0, width: 1000, height: 800 },
            rotationDeg: 0,
          }),
        ],
      })
    );
  });

  it('writes an audit log entry on success', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest({ variantId: 'var_1', photo: samplePhoto }));
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'admin_1', action: 'frame_template.test_render', resourceId: 'tpl_1' })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await POST(makeRequest({ variantId: 'var_1', photo: samplePhoto }));
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});

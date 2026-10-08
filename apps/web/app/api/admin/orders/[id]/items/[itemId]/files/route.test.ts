import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

vi.mock('server-only', () => ({}));
const mockRequirePermission = vi.fn();
vi.mock('../../../../../../../../lib/require-permission', () => ({ requirePermission: (...a: unknown[]) => mockRequirePermission(...a) }));

const mockItemGet = vi.fn();
const mockCustomizationsGet = vi.fn();
const mockUploadGet = vi.fn();
const mockJobGet = vi.fn();
const mockDb = {
  collection: vi.fn((name: string) => {
    if (name === 'orders') return { doc: vi.fn(() => ({ collection: vi.fn(() => ({ doc: vi.fn(() => ({ get: mockItemGet })) })) })) };
    if (name === 'customizations') return { where: vi.fn(() => ({ get: mockCustomizationsGet })) };
    if (name === 'uploads') return { doc: vi.fn((id: string) => ({ get: () => mockUploadGet(id) })) };
    if (name === 'printJobs') return { doc: vi.fn(() => ({ get: mockJobGet })) };
    throw new Error(`unexpected collection: ${name}`);
  }),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));
const mockExists = vi.fn();
vi.mock('firebase-admin/storage', () => ({ getStorage: () => ({ bucket: () => ({ file: () => ({ exists: mockExists }) }) }) }));
import { resetRateLimitState } from '../../../../../../../../lib/rate-limit';

const req = () => new Request('https://example.com/x', { headers: { Authorization: 'Bearer t' } });
const ctx = { params: Promise.resolve({ id: 'order_1', itemId: 'item_1' }) };

describe('GET item files', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue({ ok: true, uid: 'staff_1' });
    mockItemGet.mockResolvedValue({ exists: true, data: () => ({ personalizationId: 'p1', previewPath: 'uploads/s/previews/p1/slot-0.png' }) });
    mockCustomizationsGet.mockResolvedValue({ docs: [{ data: () => ({ uploadId: 'up_2', slotIndex: 1 }) }, { data: () => ({ uploadId: 'up_1', slotIndex: 0 }) }] });
    mockUploadGet.mockImplementation(async (id: string) => ({ exists: true, data: () => ({ originalPath: `uploads/s/${id}/original.jpg`, widthPx: 4000, heightPx: 3000 }) }));
    mockExists.mockResolvedValue([false]);
    mockJobGet.mockResolvedValue({ exists: false });
  });

  it('lists the preview, each original photo in order, and a print file that is not ready yet', async () => {
    const response = await GET(req(), ctx);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.preview).toBe(true);
    expect(body.originals).toEqual([
      { uploadId: 'up_1', label: 'Photo 1', widthPx: 4000, heightPx: 3000, available: true },
      { uploadId: 'up_2', label: 'Photo 2', widthPx: 4000, heightPx: 3000, available: true },
    ]);
    expect(body.print).toEqual({ available: false, jobStatus: null, jobError: null });
  });

  it('reports a rendered print file and the state of a failed job', async () => {
    mockExists.mockResolvedValueOnce([true]);
    mockJobGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'failed', lastError: 'font missing' }) });
    const body = await (await GET(req(), ctx)).json();
    expect(body.print).toEqual({ available: true, jobStatus: 'failed', jobError: 'font missing' });
  });

  it('marks a photo whose upload record is gone as unavailable', async () => {
    mockUploadGet.mockResolvedValueOnce({ exists: false });
    const body = await (await GET(req(), ctx)).json();
    expect(body.originals[0]).toMatchObject({ uploadId: 'up_1', available: false });
  });

  it('refuses non-staff and 404s for an unknown item', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 403 });
    expect((await GET(req(), ctx)).status).toBe(403);
    mockItemGet.mockResolvedValueOnce({ exists: false });
    expect((await GET(req(), ctx)).status).toBe(404);
  });
});

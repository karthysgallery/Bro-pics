import { describe, it, expect, vi, beforeEach } from 'vitest';
import JSZip from 'jszip';
import { GET } from './route';

vi.mock('server-only', () => ({}));
const mockRequirePermission = vi.fn();
vi.mock('../../../../../../lib/require-permission', () => ({ requirePermission: (...a: unknown[]) => mockRequirePermission(...a) }));
const mockAudit = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../../../lib/audit-log', () => ({ writeAuditLog: (...a: unknown[]) => mockAudit(...a) }));

const items = [
  { id: 'i2', data: () => ({ title: 'Canvas', qty: 1, previewPath: 'prev/i2.png', personalizationId: 'p2', combo: { comboName: 'Combo', frameLabel: 'Frame 2' } }) },
  { id: 'i1', data: () => ({ title: 'Desk Frame', qty: 1, previewPath: 'prev/i1.png', personalizationId: 'p1', combo: { comboName: 'Combo', frameLabel: 'Frame 1' } }) },
];
const mockOrderGet = vi.fn();
const mockDb = {
  collection: vi.fn((name: string) => {
    if (name === 'orders') return { doc: vi.fn(() => ({ get: mockOrderGet, collection: vi.fn(() => ({ get: async () => ({ docs: items.map((i) => ({ id: i.id, data: i.data })) }) })) })) };
    if (name === 'customizations') return { where: vi.fn((_f: string, _o: string, pid: string) => ({ get: async () => ({ docs: [{ data: () => ({ uploadId: `up_${pid}`, slotIndex: 0 }) }] }) })) };
    if (name === 'uploads') return { doc: vi.fn((id: string) => ({ get: async () => ({ exists: true, data: () => ({ originalPath: `orig/${id}.jpg`, widthPx: 4000, heightPx: 3000 }) }) })) };
    throw new Error(`unexpected collection ${name}`);
  }),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

let stored: Record<string, Buffer> = {};
vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({
    bucket: () => ({
      file: (path: string) => ({ exists: async () => [path in stored], download: async () => [stored[path]] }),
    }),
  }),
}));
import { resetRateLimitState } from '../../../../../../lib/rate-limit';

const req = () => new Request('https://example.com/x', { headers: { Authorization: 'Bearer t' } });
const ctx = { params: Promise.resolve({ id: 'order_1' }) };

describe('GET order files zip', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue({ ok: true, uid: 'staff_1' });
    mockOrderGet.mockResolvedValue({ exists: true, data: () => ({ orderNo: 'BP-2026-00001' }) });
    stored = {
      'prev/i1.png': Buffer.from('p1'), 'orig/up_p1.jpg': Buffer.from('o1'), 'print-files/order_1/i1/print.png': Buffer.from('print1'),
      'prev/i2.png': Buffer.from('p2'), 'orig/up_p2.jpg': Buffer.from('o2'), // frame 2 has no print file yet
    };
  });

  it('bundles preview, originals and print-ready file per frame, in frame order, and says what is missing', async () => {
    const response = await GET(req(), ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toContain('BP-2026-00001-files.zip');
    const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()));
    const names = Object.keys(zip.files).filter((n) => !n.endsWith('/')).sort();
    expect(names).toEqual([
      'BP-2026-00001/1-Frame-1-Desk-Frame/PRINT-READY.png',
      'BP-2026-00001/1-Frame-1-Desk-Frame/photo-1-original.jpg',
      'BP-2026-00001/1-Frame-1-Desk-Frame/preview.png',
      'BP-2026-00001/2-Frame-2-Canvas/photo-1-original.jpg',
      'BP-2026-00001/2-Frame-2-Canvas/preview.png',
      'BP-2026-00001/README.txt',
    ]);
    const readme = await zip.file('BP-2026-00001/README.txt')!.async('string');
    expect(readme).toContain('print-ready file (300 DPI): not available');
    expect(mockAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'order.files_zip', resourceId: 'order_1' }));
  });

  it('refuses non-staff and 404s for an unknown order', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 401 });
    expect((await GET(req(), ctx)).status).toBe(401);
    mockOrderGet.mockResolvedValueOnce({ exists: false });
    expect((await GET(req(), ctx)).status).toBe(404);
  });
});

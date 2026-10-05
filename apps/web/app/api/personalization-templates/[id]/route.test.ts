import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => ({}) }));
const getLatestPublished = vi.fn();
const getTemplateVersion = vi.fn();
vi.mock('../../../../lib/personalization-templates', () => ({
  getLatestPublished: (...a: unknown[]) => getLatestPublished(...a),
  getTemplateVersion: (...a: unknown[]) => getTemplateVersion(...a),
}));

import { GET } from './route';
import { resetRateLimitState } from '../../../../lib/rate-limit';

const call = (query = '') => GET(new Request(`https://example.com/api/personalization-templates/t1${query}`), { params: Promise.resolve({ id: 't1' }) });

describe('GET /api/personalization-templates/[id] (storefront)', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
  });

  it('serves the latest PUBLISHED version by default, and 404 when none is published', async () => {
    getLatestPublished.mockResolvedValue({ id: 't1', version: 3, status: 'published' });
    expect((await (await call()).json()).version).toBe(3);
    getLatestPublished.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  it('serves an exact version only when it is published or archived (saved carts/orders keep working)', async () => {
    getTemplateVersion.mockResolvedValue({ id: 't1', version: 1, status: 'archived' });
    expect((await call('?version=1')).status).toBe(200);
    getTemplateVersion.mockResolvedValue({ id: 't1', version: 1, status: 'published' });
    expect((await call('?version=1')).status).toBe(200);
  });

  it('NEVER leaks a draft or in-review template, even by asking for its exact version', async () => {
    for (const status of ['draft', 'review']) {
      getTemplateVersion.mockResolvedValue({ id: 't1', version: 2, status });
      expect((await call('?version=2')).status).toBe(404);
    }
    getTemplateVersion.mockResolvedValue(null);
    expect((await call('?version=9')).status).toBe(404);
  });

  it('rejects a malformed version', async () => {
    expect((await call('?version=abc')).status).toBe(400);
    expect((await call('?version=0')).status).toBe(400);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockQueryGet = vi.fn();
let mockQuery = { get: mockQueryGet, where: undefined as unknown };
mockQuery.where = vi.fn(() => mockQuery);
const mockDb = {
  collection: vi.fn(() => mockQuery),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../lib/rate-limit';

function makeRequest(query = '', authHeader = 'Bearer good-token'): Request {
  return new Request(`https://example.com/api/admin/staff${query}`, {
    headers: { Authorization: authHeader },
  });
}

describe('GET /api/admin/staff', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockQueryGet.mockResolvedValue({
      docs: [
        { data: () => ({ uid: 'staff_1', role: 'staff', active: true }) },
        { data: () => ({ uid: 'staff_2', role: 'admin', active: false }) },
      ],
    });
  });

  it('returns the permission-denied status when requirePermission fails', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 401 });
    const response = await GET(makeRequest());
    expect(response.status).toBe(401);
  });

  it('returns 403 when the caller lacks team:manage', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 403 });
    const response = await GET(makeRequest());
    expect(response.status).toBe(403);
  });

  it('returns all staff members when no ?active filter is provided', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await GET(makeRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.staff).toHaveLength(2);
    // no .where() call — no filter applied
    expect(mockQuery.where).not.toHaveBeenCalled();
  });

  it('filters to active=true when ?active=true', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await GET(makeRequest('?active=true'));
    expect(response.status).toBe(200);
    expect(mockQuery.where).toHaveBeenCalledWith('active', '==', true);
  });

  it('filters to active=false when ?active=false', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await GET(makeRequest('?active=false'));
    expect(response.status).toBe(200);
    expect(mockQuery.where).toHaveBeenCalledWith('active', '==', false);
  });

  it('ignores invalid ?active values and returns all staff', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await GET(makeRequest('?active=maybe'));
    expect(response.status).toBe(200);
    expect(mockQuery.where).not.toHaveBeenCalled();
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 5 });
    const response = await GET(makeRequest());
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });
});

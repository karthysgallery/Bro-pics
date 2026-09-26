import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const mockRequirePermission = vi.fn();
vi.mock('../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

vi.mock('./[domain]/route', () => ({
  GET: vi.fn().mockImplementation(async (_req, { params }) => {
    const { domain } = await params;
    return new Response(JSON.stringify({ domain, dispatched: true }), { status: 200 });
  }),
}));

import { checkRateLimit, resetRateLimitState } from '../../../../lib/rate-limit';

function makeRequest(query = ''): Request {
  return new Request(`https://example.com/api/admin/analytics${query}`, {
    headers: { Authorization: 'Bearer token' },
  });
}

describe('GET /api/admin/analytics (ABE-30)', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 401 });
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns domain list when no ?type query param is provided', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.domains).toContain('sales');
    expect(body.domains).toContain('products');
    expect(body.links).toHaveLength(body.domains.length);
  });

  it('dispatches to domain route when valid ?type is given', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const res = await GET(makeRequest('?type=sales'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.domain).toBe('sales');
    expect(body.dispatched).toBe(true);
  });

  it('returns 400 when invalid ?type is given', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const res = await GET(makeRequest('?type=invalid_type'));

    expect(res.status).toBe(400);
  });
});

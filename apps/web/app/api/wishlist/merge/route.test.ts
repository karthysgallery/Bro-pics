import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockGetUserId = vi.fn();
vi.mock('../../../../lib/verify-id-token', () => ({
  getUserIdFromAuthHeader: (...args: unknown[]) => mockGetUserId(...args),
}));

const mockGet = vi.fn();
const mockBatchSet = vi.fn();
const mockBatchCommit = vi.fn();
const mockDoc = vi.fn((id: string) => ({ id }));
const mockCollection = vi.fn(() => ({ doc: mockDoc, get: mockGet }));
const mockDb = {
  collection: vi.fn(() => ({ doc: vi.fn(() => ({ collection: mockCollection })) })),
  batch: vi.fn(() => ({ set: mockBatchSet, commit: mockBatchCommit })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../lib/rate-limit';

function makeRequest(body: unknown): Request {
  return new Request('https://example.com/api/wishlist/merge', {
    method: 'POST',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/wishlist/merge', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockBatchCommit.mockResolvedValue(undefined);
  });

  it('returns 401 when signed out', async () => {
    mockGetUserId.mockResolvedValueOnce(null);
    const response = await POST(makeRequest({ productIds: ['p1'] }));
    expect(response.status).toBe(401);
  });

  it('batch-writes every id then returns the merged list', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockGet.mockResolvedValueOnce({ docs: [{ id: 'p1' }, { id: 'p2' }] });

    const response = await POST(makeRequest({ productIds: ['p1', 'p2'] }));

    expect(response.status).toBe(200);
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalled();
    const body = await response.json();
    expect(body.productIds).toEqual(['p1', 'p2']);
  });

  it('skips the batch entirely when productIds is empty, still returns the current list', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockGet.mockResolvedValueOnce({ docs: [{ id: 'existing' }] });

    const response = await POST(makeRequest({ productIds: [] }));

    expect(response.status).toBe(200);
    expect(mockBatchSet).not.toHaveBeenCalled();
    expect(mockBatchCommit).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body.productIds).toEqual(['existing']);
  });

  it('ignores non-string entries in productIds', async () => {
    mockGetUserId.mockResolvedValueOnce('user_1');
    mockGet.mockResolvedValueOnce({ docs: [{ id: 'p1' }] });

    await POST(makeRequest({ productIds: ['p1', 42, null] }));

    expect(mockBatchSet).toHaveBeenCalledTimes(1);
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 5 });
    const response = await POST(makeRequest({ productIds: ['p1'] }));
    expect(response.status).toBe(429);
    expect(mockGetUserId).not.toHaveBeenCalled();
  });
});

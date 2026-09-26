import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getIdempotencyKeyHeader,
  findIdempotentResponse,
  recordIdempotentResponse,
} from './admin-idempotency';

vi.mock('server-only', () => ({}));

describe('getIdempotencyKeyHeader', () => {
  it('returns null when the header is missing', () => {
    expect(getIdempotencyKeyHeader(new Request('https://example.com'))).toBeNull();
  });

  it('returns null when the header is blank', () => {
    expect(getIdempotencyKeyHeader(new Request('https://example.com', { headers: { 'Idempotency-Key': '   ' } }))).toBeNull();
  });

  it('returns the trimmed header value when present', () => {
    expect(
      getIdempotencyKeyHeader(new Request('https://example.com', { headers: { 'Idempotency-Key': '  abc-123  ' } }))
    ).toBe('abc-123');
  });
});

describe('findIdempotentResponse / recordIdempotentResponse', () => {
  const mockGet = vi.fn();
  const mockSet = vi.fn();
  const mockDoc = vi.fn(() => ({ get: mockGet, set: mockSet }));
  const mockDb = { collection: vi.fn(() => ({ doc: mockDoc })) } as unknown as import('firebase-admin/firestore').Firestore;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no record exists for the key', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });
    const result = await findIdempotentResponse(mockDb, 'orders.advance', 'key-1');
    expect(result).toBeNull();
    expect(mockDoc).toHaveBeenCalledWith('orders.advance_key-1');
  });

  it('returns the stored {status, body} when a record exists', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 200, body: { ok: true } }) });
    const result = await findIdempotentResponse(mockDb, 'orders.advance', 'key-1');
    expect(result).toEqual({ status: 200, body: { ok: true } });
  });

  it('writes the doc keyed by routeKey_idempotencyKey with status and body', async () => {
    await recordIdempotentResponse(mockDb, 'returns.advance', 'key-2', 200, { status: 'refunded' });
    expect(mockDoc).toHaveBeenCalledWith('returns.advance_key-2');
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 200, body: { status: 'refunded' }, createdAt: expect.any(String) })
    );
  });
});

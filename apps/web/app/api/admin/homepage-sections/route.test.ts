import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { POST } from './route';
import { revalidatePath } from 'next/cache';

const mockRequirePermission = vi.fn();
vi.mock('../../../../lib/require-permission', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../lib/audit-log', () => ({ writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) }));

const mockSectionSet = vi.fn().mockResolvedValue(undefined);
const mockDb = {
  collection: vi.fn(() => ({
    doc: vi.fn(() => ({ id: 'sec_new_1', set: mockSectionSet })),
  })),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mockDb }));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));

vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { checkRateLimit, resetRateLimitState } from '../../../../lib/rate-limit';

const validBody = { type: 'offer_strip', title: 'Diwali Sale' };

function makeRequest(body: unknown, authHeader = 'Bearer good-token'): Request {
  return new Request('https://example.com/api/admin/homepage-sections', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/homepage-sections', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
  });

  it('returns the permission-denied status when requirePermission fails', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: false, status: 401 });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(401);
  });

  it('rejects an unknown field via strict()', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ ...validBody, notAField: 'x' }));
    expect(response.status).toBe(400);
  });

  it('rejects an unknown section type', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest({ ...validBody, type: 'random_banner' }));
    expect(response.status).toBe(400);
  });

  it('creates the section with defaults filled in, previewToken null', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(201);
    expect(mockSectionSet).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sec_new_1', type: 'offer_strip', title: 'Diwali Sale', isActive: true, sortOrder: 0, previewToken: null })
    );
  });

  it('converts ISO startsAt/endsAt strings to Dates', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest({ ...validBody, startsAt: '2026-10-01T00:00:00.000Z', endsAt: '2026-10-31T00:00:00.000Z' }));
    const written = mockSectionSet.mock.calls[0][0];
    expect(written.startsAt).toBeInstanceOf(Date);
    expect(written.endsAt).toBeInstanceOf(Date);
  });

  it('accepts hero slides for a hero_slider section', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    const heroSlides = [{ id: 'slide_1', image: '/a.jpg', mobileImage: '/a-m.jpg', title: 'Slide 1', sortOrder: 0 }];
    const response = await POST(makeRequest({ type: 'hero_slider', title: 'Hero', heroSlides }));
    expect(response.status).toBe(201);
    expect(mockSectionSet).toHaveBeenCalledWith(expect.objectContaining({ heroSlides }));
  });

  it('writes an audit log entry on successful creation', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest(validBody));
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorUid: 'admin_1', action: 'homepage_section.create', resource: 'homepage_section', resourceId: 'sec_new_1' })
    );
  });

  it('returns 429 and does not touch Firestore when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterSeconds: 7 });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(429);
    expect(mockRequirePermission).not.toHaveBeenCalled();
  });

  it('revalidates the homepage on success', async () => {
    mockRequirePermission.mockResolvedValueOnce({ ok: true, uid: 'admin_1' });
    await POST(makeRequest(validBody));
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/');
  });
});

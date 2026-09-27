import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBatchSet = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
const mockCustomizationsWhereGet = vi.fn();

let docCounter = 0;

vi.mock('../../../../lib/firebase-admin', () => ({
  getAdminApp: vi.fn(),
}));

vi.mock('../../../../lib/verify-id-token', () => ({
  getUserIdFromAuthHeader: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (name: string) => {
      if (name === 'customizations') {
        return {
          where: () => ({ get: mockCustomizationsWhereGet }),
          doc: () => ({ id: `new_doc_${++docCounter}` }),
        };
      }
      throw new Error(`Unexpected collection: ${name}`);
    },
    batch: () => ({ set: mockBatchSet, commit: mockBatchCommit }),
  }),
}));

vi.mock('../../../../lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/rate-limit')>();
  return { ...actual, checkRateLimit: vi.fn(actual.checkRateLimit) };
});

import { POST } from './route';
import { getUserIdFromAuthHeader } from '../../../../lib/verify-id-token';
import { resetRateLimitState } from '../../../../lib/rate-limit';

const originalCustomization = {
  id: 'cust_old_1',
  schemaVersion: 2,
  sessionId: 'sess_old',
  userId: 'user_1',
  personalizationId: 'pers_old',
  uploadId: 'up_1',
  variantId: 'var_1',
  slotIndex: 0,
  transformJson: {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    rotationDeg: 0,
    cropRect: { x: 0, y: 0, width: 100, height: 100 },
  },
  effectiveDpi: 300,
  dpiBand: 'green',
  status: 'locked',
  renderStatus: 'done',
  renderedFilePath: 'renders/pers_old/0.jpg',
  previewPath: 'previews/pers_old/0.jpg',
  templateVersion: 1,
  lockedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/customizations/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Session-Id': 'sess_new', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/customizations/reorder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitState();
    docCounter = 0;
    vi.mocked(getUserIdFromAuthHeader).mockResolvedValue('user_1');
    mockCustomizationsWhereGet.mockResolvedValue({ empty: false, docs: [{ data: () => originalCustomization }] });
  });

  it('requires sign-in', async () => {
    vi.mocked(getUserIdFromAuthHeader).mockResolvedValue(null);
    const response = await POST(makeRequest({ personalizationId: 'pers_old' }));
    expect(response.status).toBe(401);
  });

  it('requires X-Session-Id', async () => {
    const response = await POST(makeRequest({ personalizationId: 'pers_old' }, { 'X-Session-Id': '' }));
    expect(response.status).toBe(400);
  });

  it('requires a personalizationId', async () => {
    const response = await POST(makeRequest({}));
    expect(response.status).toBe(400);
  });

  it('404s for an unknown personalizationId', async () => {
    mockCustomizationsWhereGet.mockResolvedValue({ empty: true, docs: [] });
    const response = await POST(makeRequest({ personalizationId: 'nope' }));
    expect(response.status).toBe(404);
  });

  it("404s (never 403) for another customer's personalizationId", async () => {
    mockCustomizationsWhereGet.mockResolvedValue({
      empty: false,
      docs: [{ data: () => ({ ...originalCustomization, userId: 'someone_else' }) }],
    });
    const response = await POST(makeRequest({ personalizationId: 'pers_old' }));
    expect(response.status).toBe(404);
  });

  it('copies the customization into a fresh draft under a new personalizationId, leaving the original untouched', async () => {
    const response = await POST(makeRequest({ personalizationId: 'pers_old' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.personalizationId).not.toBe('pers_old');
    expect(body.customizations).toHaveLength(1);

    const copy = body.customizations[0];
    expect(copy.personalizationId).toBe(body.personalizationId);
    expect(copy.status).toBe('draft');
    expect(copy.renderStatus).toBe('pending');
    expect(copy.renderedFilePath).toBeUndefined();
    expect(copy.lockedAt).toBeUndefined();
    expect(copy.sessionId).toBe('sess_new');
    expect(copy.userId).toBe('user_1');
    expect(copy.uploadId).toBe('up_1');
    expect(copy.variantId).toBe('var_1');
    expect(copy.transformJson).toEqual(originalCustomization.transformJson);

    // The original doc is never written to — only new docs are batch.set.
    expect(mockBatchSet).toHaveBeenCalledTimes(1);
    expect(mockBatchSet.mock.calls[0][0].id).not.toBe('cust_old_1');
  });

  it('copies every slot of a multi-slot personalization under the same new personalizationId', async () => {
    mockCustomizationsWhereGet.mockResolvedValue({
      empty: false,
      docs: [
        { data: () => ({ ...originalCustomization, slotIndex: 1 }) },
        { data: () => ({ ...originalCustomization, slotIndex: 0 }) },
      ],
    });
    const response = await POST(makeRequest({ personalizationId: 'pers_old' }));
    const body = await response.json();
    expect(body.customizations).toHaveLength(2);
    expect(body.customizations[0].slotIndex).toBe(0);
    expect(body.customizations[1].slotIndex).toBe(1);
    expect(body.customizations[0].personalizationId).toBe(body.personalizationId);
    expect(body.customizations[1].personalizationId).toBe(body.personalizationId);
  });
});

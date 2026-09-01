import { describe, it, expect, vi } from 'vitest';

const mockSet = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../lib/firebase-admin', () => ({
  getAdminApp: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: () => ({
      doc: () => ({ id: 'cust_test123', set: mockSet }),
    }),
  }),
}));

import { POST } from './route';

const validBody = {
  sessionId: 'sess_1',
  personalizationId: 'pers_1',
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
  renderStatus: 'pending',
};

describe('POST /api/customizations', () => {
  it('creates a customization document and returns it with an id', async () => {
    const request = new Request('http://localhost/api/customizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.id).toBe('cust_test123');
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ id: 'cust_test123', ...validBody }));
  });

  it('rejects a body that fails schema validation', async () => {
    const request = new Request('http://localhost/api/customizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, transformJson: { ...validBody.transformJson, rotationDeg: 45 } }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});

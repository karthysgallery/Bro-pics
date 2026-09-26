import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeAuditLog } from './audit-log';

vi.mock('server-only', () => ({}));

describe('writeAuditLog', () => {
  const mockSet = vi.fn();
  const mockDoc = vi.fn(() => ({ id: 'audit_1', set: mockSet }));
  const mockDb = { collection: vi.fn(() => ({ doc: mockDoc })) } as unknown as import('firebase-admin/firestore').Firestore;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes an auditLogs doc with actor, action, resource, resourceId, and a timestamp', async () => {
    await writeAuditLog(mockDb, { actorUid: 'admin_1', action: 'role.grant', resource: 'user', resourceId: 'user_9' });
    expect(mockDb.collection).toHaveBeenCalledWith('auditLogs');
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'audit_1',
        actorUid: 'admin_1',
        action: 'role.grant',
        resource: 'user',
        resourceId: 'user_9',
        createdAt: expect.any(String),
      })
    );
  });

  it('omits details when not given', async () => {
    await writeAuditLog(mockDb, { actorUid: 'admin_1', action: 'role.grant', resource: 'user', resourceId: 'user_9' });
    const written = mockSet.mock.calls[0][0];
    expect(written).not.toHaveProperty('details');
  });

  it('includes details when given', async () => {
    await writeAuditLog(mockDb, {
      actorUid: 'staff_1',
      action: 'order.advance',
      resource: 'order',
      resourceId: 'order_1',
      details: { fromStatus: 'paid', toStatus: 'in_production' },
    });
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ details: { fromStatus: 'paid', toStatus: 'in_production' } })
    );
  });
});

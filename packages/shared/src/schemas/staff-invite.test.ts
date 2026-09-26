import { describe, it, expect } from 'vitest';
import { StaffInviteSchema } from './staff-invite';

const validInvite = {
  id: 'invite_token_abc123',
  email: 'newstaff@example.com',
  role: 'staff' as const,
  status: 'pending' as const,
  invitedBy: 'admin_1',
  createdAt: new Date('2026-09-01'),
  expiresAt: new Date('2026-09-08'),
  acceptedBy: null,
  acceptedAt: null,
};

describe('StaffInviteSchema', () => {
  it('accepts a valid pending invite', () => {
    expect(StaffInviteSchema.parse(validInvite)).toEqual(validInvite);
  });

  it('accepts an accepted invite with acceptedBy/acceptedAt set', () => {
    const accepted = { ...validInvite, status: 'accepted' as const, acceptedBy: 'staff_uid_1', acceptedAt: new Date('2026-09-03') };
    expect(StaffInviteSchema.parse(accepted)).toEqual(accepted);
  });

  it('rejects an invalid email', () => {
    expect(() => StaffInviteSchema.parse({ ...validInvite, email: 'not-an-email' })).toThrow();
  });

  it('rejects an unknown role', () => {
    expect(() => StaffInviteSchema.parse({ ...validInvite, role: 'owner' })).toThrow();
  });

  it('rejects an unknown status', () => {
    expect(() => StaffInviteSchema.parse({ ...validInvite, status: 'sent' })).toThrow();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { runStaleSessionCleanup, type CleanupDeps } from './cleanup-stale-sessions';

const NOW = new Date('2026-09-24T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

describe('runStaleSessionCleanup', () => {
  it('deletes stale, session-only uploads (Firestore doc + Storage object) and customizations', async () => {
    const deps: CleanupDeps = {
      fetchCandidateUploads: vi.fn().mockResolvedValue([
        { id: 'upload_stale', createdAt: new Date(NOW.getTime() - 40 * DAY_MS), originalPath: 'uploads/s1/upload_stale/original.jpg' },
        { id: 'upload_linked', userId: 'user_1', createdAt: new Date(NOW.getTime() - 40 * DAY_MS), originalPath: 'uploads/s2/upload_linked/original.jpg' },
      ]),
      fetchCandidateCustomizations: vi.fn().mockResolvedValue([
        { id: 'cust_stale', createdAt: new Date(NOW.getTime() - 40 * DAY_MS) },
      ]),
      deleteUpload: vi.fn().mockResolvedValue(undefined),
      deleteCustomization: vi.fn().mockResolvedValue(undefined),
    };

    const result = await runStaleSessionCleanup(deps, NOW);

    expect(result.deletedUploadIds).toEqual(['upload_stale']);
    expect(result.deletedCustomizationIds).toEqual(['cust_stale']);
    expect(deps.deleteUpload).toHaveBeenCalledWith('upload_stale', 'uploads/s1/upload_stale/original.jpg');
    expect(deps.deleteUpload).not.toHaveBeenCalledWith('upload_linked', expect.anything());
    expect(deps.deleteCustomization).toHaveBeenCalledWith('cust_stale');
  });

  it('deletes nothing when there are no stale candidates', async () => {
    const deps: CleanupDeps = {
      fetchCandidateUploads: vi.fn().mockResolvedValue([]),
      fetchCandidateCustomizations: vi.fn().mockResolvedValue([]),
      deleteUpload: vi.fn(),
      deleteCustomization: vi.fn(),
    };

    const result = await runStaleSessionCleanup(deps, NOW);

    expect(result).toEqual({ deletedUploadIds: [], deletedCustomizationIds: [] });
    expect(deps.deleteUpload).not.toHaveBeenCalled();
    expect(deps.deleteCustomization).not.toHaveBeenCalled();
  });
});

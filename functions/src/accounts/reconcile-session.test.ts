import { describe, it, expect, vi } from 'vitest';
import { runReconciliation } from './reconcile-session';
import type { ReconciliationTransaction } from './reconcile-session';

function makeFakeTransaction(opts: {
  matchedUploads: Array<{ id: string }>;
  matchedCustomizations: Array<{ id: string }>;
  existingCart: { items: unknown[] } | undefined;
  userAlreadyExists?: boolean;
}): ReconciliationTransaction {
  return {
    getUploadsBySessionId: vi.fn().mockResolvedValue(opts.matchedUploads),
    getCustomizationsBySessionId: vi.fn().mockResolvedValue(opts.matchedCustomizations),
    setUploadUserId: vi.fn(),
    setCustomizationUserId: vi.fn(),
    getCart: vi.fn().mockResolvedValue(opts.existingCart),
    setCart: vi.fn(),
    userExists: vi.fn().mockResolvedValue(opts.userAlreadyExists ?? false),
    upsertUser: vi.fn(),
  };
}

describe('runReconciliation', () => {
  it('reassigns every matched upload and customization to the userId', async () => {
    const tx = makeFakeTransaction({
      matchedUploads: [{ id: 'up_1' }, { id: 'up_2' }],
      matchedCustomizations: [{ id: 'c_1' }],
      existingCart: undefined,
    });
    await runReconciliation(tx, { sessionId: 'sess_1', userId: 'user_1', phone: '+91123', incomingCartItems: [] });
    expect(tx.setUploadUserId).toHaveBeenCalledWith('up_1', 'user_1');
    expect(tx.setUploadUserId).toHaveBeenCalledWith('up_2', 'user_1');
    expect(tx.setCustomizationUserId).toHaveBeenCalledWith('c_1', 'user_1');
  });

  it('merges the incoming cart into an existing cart by summing qty', async () => {
    const tx = makeFakeTransaction({
      matchedUploads: [],
      matchedCustomizations: [],
      existingCart: { items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', unitPriceSnapshot: 100, qty: 2 }] },
    });
    const incomingCartItems = [{ variantId: 'v1', personalizationId: 'p1', title: 'A', unitPriceSnapshot: 100, qty: 3 }];
    await runReconciliation(tx, { sessionId: 'sess_1', userId: 'user_1', phone: '+91123', incomingCartItems });
    expect(tx.setCart).toHaveBeenCalledWith('user_1', {
      items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', unitPriceSnapshot: 100, qty: 5 }],
    });
  });

  it('writes the incoming cart as-is when no cart exists yet', async () => {
    const tx = makeFakeTransaction({ matchedUploads: [], matchedCustomizations: [], existingCart: undefined });
    const incomingCartItems = [{ variantId: 'v1', personalizationId: 'p1', title: 'A', unitPriceSnapshot: 100, qty: 1 }];
    await runReconciliation(tx, { sessionId: 'sess_1', userId: 'user_1', phone: '+91123', incomingCartItems });
    expect(tx.setCart).toHaveBeenCalledWith('user_1', { items: incomingCartItems });
  });

  it('upserts a first-time user profile with isNewUser true', async () => {
    const tx = makeFakeTransaction({ matchedUploads: [], matchedCustomizations: [], existingCart: undefined, userAlreadyExists: false });
    await runReconciliation(tx, { sessionId: 'sess_1', userId: 'user_1', phone: '+91123', incomingCartItems: [] });
    expect(tx.upsertUser).toHaveBeenCalledWith('user_1', '+91123', true);
  });

  it('upserts a returning user profile with isNewUser false', async () => {
    const tx = makeFakeTransaction({ matchedUploads: [], matchedCustomizations: [], existingCart: undefined, userAlreadyExists: true });
    await runReconciliation(tx, { sessionId: 'sess_1', userId: 'user_1', phone: '+91123', incomingCartItems: [] });
    expect(tx.upsertUser).toHaveBeenCalledWith('user_1', '+91123', false);
  });
});

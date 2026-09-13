import { describe, it, expect, vi } from 'vitest';
import { runReconciliation } from './reconcile-session';
import type { ReconciliationTransaction } from './reconcile-session';

function makeFakeTransaction(opts: {
  matchedUploads: Array<{ id: string }>;
  matchedCustomizations: Array<{ id: string }>;
  existingCart: { items: unknown[] } | undefined;
  userAlreadyExists?: boolean;
  reconciliationAlreadyProcessed?: boolean;
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
    isReconciliationProcessed: vi.fn().mockResolvedValue(opts.reconciliationAlreadyProcessed ?? false),
    markReconciliationProcessed: vi.fn(),
  };
}

/**
 * A fake transaction that behaves like a real Firestore transaction across
 * two sequential calls: whatever the first call marks as processed is
 * actually seen as processed by isReconciliationProcessed on the second
 * call, and getCart reflects whatever setCart wrote. This is what lets the
 * "called twice with the same reconciliationId" test prove real
 * once-only behavior instead of just asserting mock call counts against a
 * transaction that doesn't actually persist anything between calls.
 */
function makeStatefulFakeTransaction(opts: {
  matchedUploads: Array<{ id: string }>;
  matchedCustomizations: Array<{ id: string }>;
  initialCart: { items: unknown[] } | undefined;
}): ReconciliationTransaction {
  let cart = opts.initialCart;
  const processedIds = new Set<string>();
  return {
    getUploadsBySessionId: vi.fn().mockResolvedValue(opts.matchedUploads),
    getCustomizationsBySessionId: vi.fn().mockResolvedValue(opts.matchedCustomizations),
    setUploadUserId: vi.fn(),
    setCustomizationUserId: vi.fn(),
    getCart: vi.fn(async () => cart),
    setCart: vi.fn((_userId: string, next: { items: unknown[] }) => {
      cart = next;
    }),
    userExists: vi.fn().mockResolvedValue(true),
    upsertUser: vi.fn(),
    isReconciliationProcessed: vi.fn(async (id: string) => processedIds.has(id)),
    markReconciliationProcessed: vi.fn((id: string) => {
      processedIds.add(id);
    }),
  } as unknown as ReconciliationTransaction;
}

describe('runReconciliation', () => {
  it('reassigns every matched upload and customization to the userId', async () => {
    const tx = makeFakeTransaction({
      matchedUploads: [{ id: 'up_1' }, { id: 'up_2' }],
      matchedCustomizations: [{ id: 'c_1' }],
      existingCart: undefined,
    });
    await runReconciliation(tx, { sessionId: 'sess_1', userId: 'user_1', phone: '+91123', incomingCartItems: [], reconciliationId: 'recon_1' });
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
    await runReconciliation(tx, { sessionId: 'sess_1', userId: 'user_1', phone: '+91123', incomingCartItems, reconciliationId: 'recon_1' });
    expect(tx.setCart).toHaveBeenCalledWith('user_1', {
      items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', unitPriceSnapshot: 100, qty: 5 }],
    });
  });

  it('writes the incoming cart as-is when no cart exists yet', async () => {
    const tx = makeFakeTransaction({ matchedUploads: [], matchedCustomizations: [], existingCart: undefined });
    const incomingCartItems = [{ variantId: 'v1', personalizationId: 'p1', title: 'A', unitPriceSnapshot: 100, qty: 1 }];
    await runReconciliation(tx, { sessionId: 'sess_1', userId: 'user_1', phone: '+91123', incomingCartItems, reconciliationId: 'recon_1' });
    expect(tx.setCart).toHaveBeenCalledWith('user_1', { items: incomingCartItems });
  });

  it('upserts a first-time user profile with isNewUser true', async () => {
    const tx = makeFakeTransaction({ matchedUploads: [], matchedCustomizations: [], existingCart: undefined, userAlreadyExists: false });
    await runReconciliation(tx, { sessionId: 'sess_1', userId: 'user_1', phone: '+91123', incomingCartItems: [], reconciliationId: 'recon_1' });
    expect(tx.upsertUser).toHaveBeenCalledWith('user_1', '+91123', true);
  });

  it('upserts a returning user profile with isNewUser false', async () => {
    const tx = makeFakeTransaction({ matchedUploads: [], matchedCustomizations: [], existingCart: undefined, userAlreadyExists: true });
    await runReconciliation(tx, { sessionId: 'sess_1', userId: 'user_1', phone: '+91123', incomingCartItems: [], reconciliationId: 'recon_1' });
    expect(tx.upsertUser).toHaveBeenCalledWith('user_1', '+91123', false);
  });

  it('marks the reconciliationId as processed after doing the real work', async () => {
    const tx = makeFakeTransaction({ matchedUploads: [], matchedCustomizations: [], existingCart: undefined });
    await runReconciliation(tx, { sessionId: 'sess_1', userId: 'user_1', phone: '+91123', incomingCartItems: [], reconciliationId: 'recon_1' });
    expect(tx.markReconciliationProcessed).toHaveBeenCalledWith('recon_1');
  });

  it('skips every write when the reconciliationId was already processed', async () => {
    const tx = makeFakeTransaction({
      matchedUploads: [{ id: 'up_1' }],
      matchedCustomizations: [{ id: 'c_1' }],
      existingCart: { items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', unitPriceSnapshot: 100, qty: 1 }] },
      reconciliationAlreadyProcessed: true,
    });
    const incomingCartItems = [{ variantId: 'v1', personalizationId: 'p1', title: 'A', unitPriceSnapshot: 100, qty: 1 }];
    await runReconciliation(tx, { sessionId: 'sess_1', userId: 'user_1', phone: '+91123', incomingCartItems, reconciliationId: 'recon_1' });
    expect(tx.setUploadUserId).not.toHaveBeenCalled();
    expect(tx.setCustomizationUserId).not.toHaveBeenCalled();
    expect(tx.setCart).not.toHaveBeenCalled();
    expect(tx.upsertUser).not.toHaveBeenCalled();
    expect(tx.markReconciliationProcessed).not.toHaveBeenCalled();
  });

  it('calling it twice with the same reconciliationId and the same cart items merges the cart exactly once, not twice (Critical 1 idempotency regression)', async () => {
    // This is the reviewer-identified gap: a real network drop AFTER the
    // server commits the transaction but BEFORE the callable's response
    // reaches the client is an ordinary Cloud Functions failure mode. If
    // the client retries reconciliation for the same underlying cart state
    // without an idempotency key, the second call's
    // mergeCartItems(existingCart.items, incomingCartItems) would merge
    // the incoming items into a cart that already includes them from the
    // first (successful, but unacknowledged) commit — doubling every
    // quantity, permanently. Using a stateful fake transaction (not the
    // mock-call-count-only makeFakeTransaction above) proves the actual
    // server-side cart document ends up correct after two calls, not just
    // that some mock was or wasn't invoked.
    const tx = makeStatefulFakeTransaction({
      matchedUploads: [],
      matchedCustomizations: [],
      initialCart: undefined,
    });
    const incomingCartItems = [{ variantId: 'v1', personalizationId: 'p1', title: 'A', unitPriceSnapshot: 100, qty: 2 }];

    await runReconciliation(tx, {
      sessionId: 'sess_1',
      userId: 'user_1',
      phone: '+91123',
      incomingCartItems,
      reconciliationId: 'recon_retry_1',
    });
    // Simulates the client never learning the first call succeeded and
    // retrying with the SAME reconciliationId and the SAME cart snapshot.
    await runReconciliation(tx, {
      sessionId: 'sess_1',
      userId: 'user_1',
      phone: '+91123',
      incomingCartItems,
      reconciliationId: 'recon_retry_1',
    });

    const finalCart = await tx.getCart('user_1');
    expect(finalCart).toEqual({
      items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', unitPriceSnapshot: 100, qty: 2 }],
    });
  });

  it('a retry with a DIFFERENT reconciliationId is treated as a new attempt and merges again (sanity check on the guard)', async () => {
    const tx = makeStatefulFakeTransaction({
      matchedUploads: [],
      matchedCustomizations: [],
      initialCart: undefined,
    });
    const incomingCartItems = [{ variantId: 'v1', personalizationId: 'p1', title: 'A', unitPriceSnapshot: 100, qty: 2 }];

    await runReconciliation(tx, {
      sessionId: 'sess_1', userId: 'user_1', phone: '+91123', incomingCartItems, reconciliationId: 'recon_a',
    });
    await runReconciliation(tx, {
      sessionId: 'sess_1', userId: 'user_1', phone: '+91123', incomingCartItems, reconciliationId: 'recon_b',
    });

    const finalCart = await tx.getCart('user_1');
    expect(finalCart).toEqual({
      items: [{ variantId: 'v1', personalizationId: 'p1', title: 'A', unitPriceSnapshot: 100, qty: 4 }],
    });
  });
});

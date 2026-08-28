import { describe, it, expect, vi } from 'vitest';
import { isDuplicateWebhookEvent, markWebhookProcessed } from './idempotency';
import type { WebhookTransaction } from './idempotency';

function makeFakeTransaction(exists: boolean): WebhookTransaction {
  return {
    get: vi.fn().mockResolvedValue({ exists }),
    set: vi.fn(),
  };
}

describe('isDuplicateWebhookEvent', () => {
  it('returns false when the event has not been seen', async () => {
    const tx = makeFakeTransaction(false);
    const result = await isDuplicateWebhookEvent(tx, 'evt_123');
    expect(result).toBe(false);
  });

  it('returns true when the event already exists', async () => {
    const tx = makeFakeTransaction(true);
    const result = await isDuplicateWebhookEvent(tx, 'evt_123');
    expect(result).toBe(true);
  });
});

describe('markWebhookProcessed', () => {
  it('writes the event id and order id into the same transaction', () => {
    const tx = makeFakeTransaction(false);
    markWebhookProcessed(tx, 'evt_123', 'order_456');
    expect(tx.set).toHaveBeenCalledWith(
      { path: 'webhookEvents/evt_123' },
      expect.objectContaining({ orderId: 'order_456' })
    );
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { logger, scrubPii } from './logger';

describe('scrubPii', () => {
  it('redacts known PII keys wholesale, case-insensitively', () => {
    const result = scrubPii({ email: 'a@b.com', Phone: '+911234567890', orderId: 'order_1' });
    expect(result.email).toBe('[REDACTED]');
    expect(result.Phone).toBe('[REDACTED]');
    expect(result.orderId).toBe('order_1');
  });

  it('leaves non-PII keys untouched', () => {
    const result = scrubPii({ requestId: 'req_1', uid: 'user_1', status: 'paid' });
    expect(result).toEqual({ requestId: 'req_1', uid: 'user_1', status: 'paid' });
  });
});

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes info as a JSON line to console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('order placed', { orderId: 'order_1' });
    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(parsed).toMatchObject({ level: 'info', message: 'order placed', orderId: 'order_1' });
    expect(parsed.timestamp).toEqual(expect.any(String));
  });

  it('writes error as a JSON line to console.error, with PII in context scrubbed', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('notification failed', { orderId: 'order_1', email: 'customer@example.com' });
    const parsed = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(parsed).toMatchObject({ level: 'error', message: 'notification failed', orderId: 'order_1', email: '[REDACTED]' });
  });

  it('writes warn as a JSON line to console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.warn('rate limited');
    const parsed = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(parsed).toMatchObject({ level: 'warn', message: 'rate limited' });
  });
});

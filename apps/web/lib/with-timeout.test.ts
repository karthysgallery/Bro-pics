import { describe, it, expect, vi } from 'vitest';
import { withTimeout, TimeoutError } from './with-timeout';

describe('withTimeout', () => {
  it('resolves with the inner value when it settles before the timeout', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 1000, 'too slow');
    expect(result).toBe('ok');
  });

  it('rejects with the inner error when it rejects before the timeout', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000, 'too slow')).rejects.toThrow('boom');
  });

  it('rejects with a TimeoutError when the inner promise never settles in time', async () => {
    vi.useFakeTimers();
    const never = new Promise(() => {});
    const result = withTimeout(never, 50, 'decode took too long');
    const assertion = expect(result).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    vi.useRealTimers();
  });
});

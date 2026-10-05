import { describe, it, expect, vi, afterEach } from 'vitest';
import { timeoutSignal } from './timeout-signal';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('timeoutSignal', () => {
  it('returns a live signal that aborts after the delay (fallback path, as on older iOS Safari)', () => {
    vi.useFakeTimers();
    // Simulate a browser without AbortSignal.timeout.
    const NativeAbortSignal = AbortSignal;
    vi.stubGlobal('AbortSignal', class extends NativeAbortSignal {} as unknown as typeof AbortSignal);
    (AbortSignal as unknown as { timeout?: unknown }).timeout = undefined;

    const signal = timeoutSignal(5000);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(4999);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(2);
    expect(signal.aborted).toBe(true);
  });

  it('does not throw when AbortSignal.timeout is missing', () => {
    const NativeAbortSignal = AbortSignal;
    vi.stubGlobal('AbortSignal', class extends NativeAbortSignal {} as unknown as typeof AbortSignal);
    (AbortSignal as unknown as { timeout?: unknown }).timeout = undefined;
    expect(() => timeoutSignal(1000)).not.toThrow();
  });

  it('returns a normal, not-yet-aborted signal when the native API exists', () => {
    expect(timeoutSignal(60_000).aborted).toBe(false);
  });
});

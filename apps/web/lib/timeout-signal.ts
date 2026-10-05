/**
 * An AbortSignal that fires after `ms`. Uses the native AbortSignal.timeout
 * where it exists, and falls back to AbortController + setTimeout for older
 * browsers (notably iOS Safari before 16) — where calling the native one
 * throws a TypeError, which at checkout surfaced as a bogus "check your
 * connection" for every single order.
 */
export function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

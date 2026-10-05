/**
 * Where to send someone after sign-in/sign-up, from a user-controllable
 * `?redirect=` query parameter. Only same-site relative paths are honoured:
 * an absolute URL, a protocol-relative `//host`, a backslash trick, or
 * anything that isn't a plain "/path" falls back to the default — otherwise
 * `/signin?redirect=https://evil.example` becomes an open redirect that
 * bounces freshly authenticated users to an attacker's site.
 */
export function safeRedirectTarget(raw: string | null | undefined, fallback = '/account'): string {
  if (!raw || typeof raw !== 'string') return fallback;
  if (raw.length > 300) return fallback;
  if (!raw.startsWith('/')) return fallback; // absolute URLs, javascript:, bare words
  if (raw.startsWith('//') || raw.startsWith('/\\')) return fallback; // protocol-relative
  if (/[\\\u0000-\u001f]/.test(raw)) return fallback; // backslashes / control characters
  return raw;
}

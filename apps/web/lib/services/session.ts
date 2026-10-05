import crypto from 'crypto';

export interface SessionData {
  userId: string;
  phone: string;
  role: string;
  name?: string;
  email?: string | null;
  status: string;
  expiresAt: number;
}

const SESSION_COOKIE_NAME = 'karthys_session';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

const DEV_SESSION_SECRET = 'karthys-gallery-dev-secret-do-not-use-in-production-min32chars';

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  // A hard-coded fallback in production would let anyone who has read this
  // file forge a session cookie, so production refuses to run without a real
  // secret (login routes surface this as a 503).
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set to a random string of at least 32 characters in production');
  }
  return DEV_SESSION_SECRET;
}

/**
 * Signs session payload into a secure tamper-evident string:
 * base64(JSON(payload)) . hmac_signature
 */
export function createSessionToken(data: Omit<SessionData, 'expiresAt'>): string {
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  const payload: SessionData = { ...data, expiresAt };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');

  return `${encoded}.${signature}`;
}

/**
 * Validates and decodes a signed session token. Returns null if invalid or expired.
 */
export function verifySessionToken(token: string | null | undefined): SessionData | null {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encoded, signature] = parts;
  let secret: string;
  try {
    secret = getSessionSecret();
  } catch {
    // Misconfigured production: no cookie can be trusted, but a read must
    // not crash — signing in (createSessionToken) is what reports the error.
    return null;
  }
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(encoded)
    .digest('base64url');

  const sigA = Buffer.from(signature);
  const sigB = Buffer.from(expectedSignature);
  if (sigA.length !== sigB.length || !crypto.timingSafeEqual(sigA, sigB)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as SessionData;
    if (Date.now() > payload.expiresAt) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Extracts and verifies session data from incoming Request cookies.
 */
export function getSessionFromRequest(request: Request): SessionData | null {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  return verifySessionToken(match[1]);
}

/**
 * Creates Set-Cookie header options for a session token.
 */
export function buildSessionCookieHeader(token: string): string {
  const isProd = process.env.NODE_ENV === 'production';
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${
    isProd ? '; Secure' : ''
  }`;
}

/**
 * Creates Set-Cookie header to clear session cookie on logout.
 */
export function buildClearSessionCookieHeader(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

/**
 * Attaches the session cookie directly onto a NextResponse.
 */
export function attachSessionCookie(response: any, token: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  if (response?.cookies?.set) {
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: SESSION_TTL_SECONDS,
      secure: isProd,
    });
  } else {
    response.headers.set('Set-Cookie', buildSessionCookieHeader(token));
  }
}

/**
 * Clears the session cookie directly on a NextResponse.
 */
export function clearSessionCookie(response: any): void {
  if (response?.cookies?.set) {
    response.cookies.set(SESSION_COOKIE_NAME, '', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 0,
      expires: new Date(0),
    });
  } else {
    response.headers.set('Set-Cookie', buildClearSessionCookieHeader());
  }
}


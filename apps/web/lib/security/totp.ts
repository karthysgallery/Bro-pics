import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Authenticator-app codes (TOTP, RFC 6238 — what Google Authenticator,
 * Microsoft Authenticator, Authy and 1Password use): a 6-digit code from a
 * shared secret and the current 30-second time step.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const STEP_SECONDS = 30;
export const DIGITS = 6;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error('Invalid base32');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new random secret (160 bits, base32), as authenticator apps expect. */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: Buffer, counter: number, digits = DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(msg).digest();
  const offset = h[h.length - 1]! & 15;
  const bin = ((h[offset]! & 127) << 24) | (h[offset + 1]! << 16) | (h[offset + 2]! << 8) | h[offset + 3]!;
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export const stepAt = (nowMs: number) => Math.floor(nowMs / 1000 / STEP_SECONDS);

/**
 * The time step a code belongs to (allowing one step either side for clock
 * drift), or null. A step at or before `lastUsedStep` is refused, so a code
 * seen over someone's shoulder cannot be used a second time.
 */
export function verifyTotp(secretB32: string, code: string, nowMs: number, lastUsedStep: number | null = null): number | null {
  const digits = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(digits)) return null;
  const secret = base32Decode(secretB32);
  const now = stepAt(nowMs);
  for (const step of [now - 1, now, now + 1]) {
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    const expected = Buffer.from(hotp(secret, step));
    if (timingSafeEqual(expected, Buffer.from(digits))) return step;
  }
  return null;
}

/** The address an authenticator app reads from the QR code. */
export function otpauthUri(issuer: string, account: string, secretB32: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

/**
 * How many 30-second steps a code is away from now (for explaining a wrong phone clock during set-up), or
 * null when it matches no time within `maxSteps`. Never used to accept a code — only to explain a refusal.
 */
export function clockOffsetSteps(secretB32: string, code: string, nowMs: number, maxSteps = 120): number | null {
  const digits = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(digits)) return null;
  const secret = base32Decode(secretB32);
  const now = stepAt(nowMs);
  for (let d = 2; d <= maxSteps; d++) {
    for (const sign of [-1, 1]) {
      const expected = Buffer.from(hotp(secret, now + sign * d));
      if (timingSafeEqual(expected, Buffer.from(digits))) return sign * d;
    }
  }
  return null;
}

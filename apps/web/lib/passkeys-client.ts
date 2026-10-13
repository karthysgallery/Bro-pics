import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';

/** What this browser can do about fingerprint / Face ID sign-in. */
export async function passkeySupport(): Promise<{ any: boolean; builtIn: boolean }> {
  if (typeof window === 'undefined' || !browserSupportsWebAuthn()) return { any: false, builtIn: false };
  return { any: true, builtIn: await platformAuthenticatorIsAvailable().catch(() => false) };
}

/** A short name for this device, e.g. "Chrome on Mac", shown in the list of devices. */
export function deviceLabel(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent): string {
  const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${browser} on ${os}`;
}

/** Plain words for what the browser said when the person cancelled or the device could not be used. */
export function passkeyErrorMessage(e: unknown): string {
  const name = (e as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'AbortError') return 'That was cancelled or timed out. Try again when you are ready.';
  if (name === 'InvalidStateError') return 'This device is already added.';
  if (name === 'NotSupportedError' || name === 'SecurityError') return 'This browser or web address cannot use fingerprint or Face ID. Use the code from your authenticator app.';
  return e instanceof Error && e.message ? e.message : 'That did not work. Try again.';
}

export type Call = <T>(path: string, body?: unknown) => Promise<T>;

/** Adds this device: asks the server for a challenge, lets the device sign it (fingerprint / Face ID), saves the result. */
export async function addThisDevice(call: Call, name = deviceLabel()): Promise<void> {
  const options = await call<PublicKeyCredentialCreationOptionsJSON>('/api/admin/mfa/passkeys/register/options', {});
  const response = await startRegistration({ optionsJSON: options });
  await call('/api/admin/mfa/passkeys/register/verify', { response, name });
}

/** Signs in with a fingerprint / Face ID that was added before. */
export async function signInWithDevice(call: Call): Promise<void> {
  const options = await call<PublicKeyCredentialRequestOptionsJSON>('/api/admin/mfa/passkeys/login/options', {});
  const response = await startAuthentication({ optionsJSON: options });
  await call('/api/admin/mfa/passkeys/login/verify', { response });
}

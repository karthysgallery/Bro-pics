import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';
import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from '@simplewebauthn/server';

/**
 * A software stand-in for a fingerprint / Face ID device, for tests only: it makes real WebAuthn answers
 * (an ES256 key, signed challenges, a counter) so the server's real verification code is exercised.
 */
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const sha256 = (b: Uint8Array | string) => createHash('sha256').update(b).digest();

export function softAuthenticator() {
  const { privateKey, publicKey }: { privateKey: KeyObject; publicKey: KeyObject } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const credentialId = randomBytes(32);
  let counter = 0;
  const cose = new Map<number, number | Uint8Array>([
    [1, 2],
    [3, -7],
    [-1, 1],
    [-2, Buffer.from(jwk.x, 'base64url')],
    [-3, Buffer.from(jwk.y, 'base64url')],
  ]);
  const be32 = (n: number) => Buffer.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);

  return {
    id: b64(credentialId),
    register(options: PublicKeyCredentialCreationOptionsJSON, origin: string, opts: { userVerified?: boolean; challenge?: string } = {}): RegistrationResponseJSON {
      const uv = opts.userVerified !== false;
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: opts.challenge ?? options.challenge, origin, crossOrigin: false }));
      const flags = 0x01 | 0x40 | (uv ? 0x04 : 0);
      const authData = Buffer.concat([sha256(options.rp.id ?? new URL(origin).hostname), Buffer.from([flags]), be32(counter), Buffer.alloc(16), Buffer.from([credentialId.length >> 8, credentialId.length & 255]), credentialId, Buffer.from(isoCBOR.encode(cose))]);
      const attestationObject = Buffer.from(isoCBOR.encode(new Map<string, never>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]] as never)));
      return { id: b64(credentialId), rawId: b64(credentialId), type: 'public-key', response: { clientDataJSON: b64(clientDataJSON), attestationObject: b64(attestationObject), transports: ['internal'] }, clientExtensionResults: {}, authenticatorAttachment: 'platform' };
    },
    authenticate(options: PublicKeyCredentialRequestOptionsJSON, origin: string, userHandle: string, opts: { userVerified?: boolean; challenge?: string; counter?: number } = {}): AuthenticationResponseJSON {
      const uv = opts.userVerified !== false;
      counter = opts.counter ?? counter + 1;
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: opts.challenge ?? options.challenge, origin, crossOrigin: false }));
      const authData = Buffer.concat([sha256(options.rpId ?? new URL(origin).hostname), Buffer.from([0x01 | (uv ? 0x04 : 0)]), be32(counter)]);
      const signature = sign('sha256', Buffer.concat([authData, sha256(clientDataJSON)]), privateKey);
      return { id: b64(credentialId), rawId: b64(credentialId), type: 'public-key', response: { clientDataJSON: b64(clientDataJSON), authenticatorData: b64(authData), signature: b64(signature), userHandle: b64(Buffer.from(userHandle)) }, clientExtensionResults: {}, authenticatorAttachment: 'platform' };
    },
  };
}

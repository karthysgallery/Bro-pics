import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../lib/auth-context', () => ({ useAuth: () => ({ user: { getIdToken: async () => 'token' } }) }));
const support = vi.hoisted(() => ({ value: { any: true, builtIn: true } }));
const signInWithDevice = vi.hoisted(() => vi.fn());
const addThisDevice = vi.hoisted(() => vi.fn());
vi.mock('../../lib/passkeys-client', () => ({
  passkeySupport: async () => support.value,
  signInWithDevice,
  addThisDevice,
  passkeyErrorMessage: (e: unknown) => (e instanceof Error ? e.message : 'That did not work. Try again.'),
}));

import { AdminMfaGate } from './AdminMfaGate';

type Reply = { status?: number; body: unknown };
let replies: Record<string, Reply[]> = {};
const fetchMock = vi.fn(async (url: string) => {
  const r = replies[url]?.shift() ?? { status: 500, body: { error: 'unexpected' } };
  return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
});
const status = (over: Partial<{ enrolled: boolean; verified: boolean; passkeys: number }>) => ({ body: { enrolled: true, verified: false, lockedUntil: null, recoveryLeft: 8, passkeys: 0, account: '+919999999999', ...over } });
const gate = () => render(<AdminMfaGate onSignOut={vi.fn()}><p>ADMIN CONTENT</p></AdminMfaGate>);

describe('AdminMfaGate — fingerprint / Face ID', () => {
  beforeEach(() => {
    replies = {};
    fetchMock.mockClear();
    signInWithDevice.mockReset();
    addThisDevice.mockReset();
    support.value = { any: true, builtIn: true };
    vi.stubGlobal('fetch', fetchMock);
  });

  it('offers the fingerprint / Face ID button when the account has a device, and signs in with it (no code typed)', async () => {
    replies['/api/admin/mfa'] = [status({ passkeys: 1 }), status({ passkeys: 1, verified: true })];
    signInWithDevice.mockResolvedValue(undefined);
    gate();
    fireEvent.click(await screen.findByRole('button', { name: 'Use fingerprint / Face ID' }));
    expect(await screen.findByText('ADMIN CONTENT')).toBeTruthy();
    expect(signInWithDevice).toHaveBeenCalledTimes(1);
  });

  it('keeps the code box beside it, and says why when the device answer was cancelled', async () => {
    replies['/api/admin/mfa'] = [status({ passkeys: 1 })];
    signInWithDevice.mockRejectedValue(new Error('That was cancelled or timed out. Try again when you are ready.'));
    gate();
    expect(await screen.findByLabelText('Authenticator code')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Use fingerprint / Face ID' }));
    expect(await screen.findByText(/cancelled or timed out/)).toBeTruthy();
    expect(screen.queryByText('ADMIN CONTENT')).toBeNull();
  });

  it('shows no button when the account has no device, or the browser cannot do it', async () => {
    replies['/api/admin/mfa'] = [status({ passkeys: 0 })];
    gate();
    await screen.findByLabelText('Authenticator code');
    expect(screen.queryByRole('button', { name: 'Use fingerprint / Face ID' })).toBeNull();
  });

  it('after a code sign-in, offers to add this device once; adding it goes on into the admin', async () => {
    replies['/api/admin/mfa'] = [status({ verified: true, passkeys: 0 }), status({ verified: true, passkeys: 1 })];
    addThisDevice.mockResolvedValue(undefined);
    gate();
    expect(await screen.findByText('Skip the code next time?')).toBeTruthy();
    expect(screen.queryByText('ADMIN CONTENT')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add fingerprint / Face ID' }));
    expect(await screen.findByText('ADMIN CONTENT')).toBeTruthy();
    expect(addThisDevice).toHaveBeenCalledTimes(1);
  });

  it('“Not now” goes on into the admin and is not asked again for a while', async () => {
    replies['/api/admin/mfa'] = [status({ verified: true }), status({ verified: true })];
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: () => null, setItem, removeItem: vi.fn(), clear: vi.fn(), key: () => null, length: 0 });
    gate();
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(await screen.findByText('ADMIN CONTENT')).toBeTruthy();
    expect(setItem.mock.calls.some(([k]) => String(k).startsWith('kg:passkey-offer:'))).toBe(true);
  });

  it('is not offered on a browser without fingerprint or Face ID, or when this device already has one', async () => {
    support.value = { any: true, builtIn: false };
    replies['/api/admin/mfa'] = [status({ verified: true })];
    gate();
    expect(await screen.findByText('ADMIN CONTENT')).toBeTruthy();
    expect(screen.queryByText('Skip the code next time?')).toBeNull();
  });

  it('shows the reason when adding the device fails, and stays on the offer', async () => {
    replies['/api/admin/mfa'] = [status({ verified: true })];
    addThisDevice.mockRejectedValue(new Error('This device is already added.'));
    gate();
    fireEvent.click(await screen.findByRole('button', { name: 'Add fingerprint / Face ID' }));
    expect(await screen.findByText('This device is already added.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('ADMIN CONTENT')).toBeNull());
  });
});

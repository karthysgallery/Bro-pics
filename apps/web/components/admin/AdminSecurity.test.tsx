import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => vi.fn());
const addThisDevice = vi.hoisted(() => vi.fn());
const support = vi.hoisted(() => ({ value: { any: true, builtIn: true } }));
vi.mock('./template-builder/use-admin-api', () => ({ useAdminApi: () => api }));
vi.mock('../ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../lib/passkeys-client', () => ({ passkeySupport: async () => support.value, addThisDevice, passkeyErrorMessage: (e: unknown) => String(e) }));

import { AdminSecurity } from './AdminSecurity';

const device = { id: 'cred1', name: 'Chrome on Mac', createdAt: '2026-10-12T10:00:00.000Z', lastUsedAt: null, deviceType: 'multiDevice' as const, backedUp: true };

describe('AdminSecurity', () => {
  beforeEach(() => {
    api.mockReset();
    addThisDevice.mockReset();
    support.value = { any: true, builtIn: true };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('lists the devices (never the keys) and removes one after asking', async () => {
    let list = [device];
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/api/admin/mfa/passkeys') return { passkeys: list };
      if (path === '/api/admin/mfa/passkeys/cred1' && init?.method === 'DELETE') { list = []; return { ok: true }; }
      throw new Error(`unexpected ${path}`);
    });
    render(<AdminSecurity />);
    expect(await screen.findByText('Chrome on Mac')).toBeTruthy();
    expect(screen.getByText(/Synced across your devices/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('No device added yet.')).toBeTruthy();
  });

  it('adds this device and reloads the list', async () => {
    let list: typeof device[] = [];
    api.mockImplementation(async () => ({ passkeys: list }));
    addThisDevice.mockImplementation(async () => { list = [device]; });
    render(<AdminSecurity />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add this device' }));
    expect(await screen.findByText('Chrome on Mac')).toBeTruthy();
    expect(addThisDevice).toHaveBeenCalledTimes(1);
  });

  it('explains when the browser cannot use fingerprint or Face ID', async () => {
    support.value = { any: false, builtIn: false };
    api.mockResolvedValue({ passkeys: [] });
    render(<AdminSecurity />);
    expect(await screen.findByText(/cannot use fingerprint or Face ID/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add this device' })).toBeNull();
  });

  it('shows why the list could not load', async () => {
    api.mockRejectedValue(new Error('Enter your authenticator code first.'));
    render(<AdminSecurity />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('authenticator code first'));
  });
});

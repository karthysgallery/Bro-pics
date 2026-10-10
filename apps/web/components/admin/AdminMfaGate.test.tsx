import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../lib/auth-context', () => ({ useAuth: () => ({ user: { getIdToken: async () => 'token' } }) }));

import { AdminMfaGate, ADMIN_REVERIFY_EVENT } from './AdminMfaGate';

type Reply = { status?: number; body: unknown };
let replies: Record<string, Reply[]> = {};
const fetchMock = vi.fn(async (url: string) => {
  const r = replies[url]?.shift() ?? { status: 500, body: { error: 'unexpected' } };
  return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
});

const status = (over: Partial<{ enrolled: boolean; verified: boolean; lockedUntil: string | null }>) => ({ body: { enrolled: false, verified: false, lockedUntil: null, recoveryLeft: 0, account: '+919999999999', ...over } });
const gate = () => render(<AdminMfaGate onSignOut={vi.fn()}><p>ADMIN CONTENT</p></AdminMfaGate>);

describe('AdminMfaGate — the authenticator step', () => {
  beforeEach(() => {
    replies = {};
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('shows nothing of the admin until set up: QR code, first code, recovery codes, then in', async () => {
    replies['/api/admin/mfa'] = [status({}), status({ enrolled: true, verified: true })];
    replies['/api/admin/mfa/enrol'] = [{ body: { qrImage: 'data:image/png;base64,AAA', secret: 'ABCD EFGH' } }];
    replies['/api/admin/mfa/enrol/confirm'] = [{ body: { recoveryCodes: ['AAAA-BBBB', 'CCCC-DDDD'] } }];
    gate();
    fireEvent.click(await screen.findByRole('button', { name: 'Show the QR code' }));
    expect(screen.queryByText('ADMIN CONTENT')).toBeNull();
    expect((await screen.findByAltText(/QR code/)).getAttribute('src')).toBe('data:image/png;base64,AAA');
    fireEvent.change(screen.getByLabelText('Code from the app'), { target: { value: '12 34 56' } });
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(await screen.findByText('AAAA-BBBB')).toBeTruthy();
    expect(JSON.parse(String((fetchMock.mock.calls.find(([u]) => u === '/api/admin/mfa/enrol/confirm') as unknown as [string, RequestInit])[1].body))).toEqual({ code: '123456' });
    // Continue only after confirming the codes are saved.
    expect((screen.getByRole('button', { name: 'Continue to the admin' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to the admin' }));
    expect(await screen.findByText('ADMIN CONTENT')).toBeTruthy();
  });

  it('asks for the code at sign-in, shows the server’s reason when it is wrong, and lets a recovery code in', async () => {
    replies['/api/admin/mfa'] = [status({ enrolled: true }), status({ enrolled: true, verified: true })];
    replies['/api/admin/mfa/verify'] = [{ status: 400, body: { error: { message: 'That code is not right. 4 tries left before a 15-minute lock.' } } }, { body: { ok: true } }];
    gate();
    fireEvent.change(await screen.findByLabelText('Authenticator code'), { target: { value: '111111' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/4 tries left/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Use a recovery code/ }));
    fireEvent.change(screen.getByLabelText('Recovery code'), { target: { value: 'aaaa-bbbb' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('ADMIN CONTENT')).toBeTruthy();
  });

  it('asks again when the admin API refuses a call (the 12 hours ran out)', async () => {
    replies['/api/admin/mfa'] = [status({ enrolled: true, verified: true }), status({ enrolled: true, verified: false })];
    gate();
    expect(await screen.findByText('ADMIN CONTENT')).toBeTruthy();
    window.dispatchEvent(new Event(ADMIN_REVERIFY_EVENT));
    await waitFor(() => expect(screen.queryByText('ADMIN CONTENT')).toBeNull());
    expect(screen.getByLabelText('Authenticator code')).toBeTruthy();
  });
});

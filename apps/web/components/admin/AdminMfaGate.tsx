'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../../lib/auth-context';

interface Status {
  enrolled: boolean;
  verified: boolean;
  lockedUntil: string | null;
  recoveryLeft: number;
  account: string;
}

/** Fired by the admin API helper when a call is refused, so the gate can ask for a fresh code. */
export const ADMIN_REVERIFY_EVENT = 'kg:admin-reverify';

const panel = 'w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-7 shadow-2xl sm:p-8';
const codeInput =
  'h-14 w-full rounded-xl border border-slate-700 bg-slate-950 text-center font-mono text-2xl tracking-[0.5em] text-slate-100 outline-none placeholder:text-slate-700 focus:border-amber-500';
const primary = 'flex h-11 w-full items-center justify-center rounded-xl bg-amber-500 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400 disabled:opacity-40';

function Shell({ title, children, onSignOut }: { title: string; children: ReactNode; onSignOut: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-5 text-slate-100 antialiased">
      <div className={panel}>
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="5" y="2" width="14" height="20" rx="2" />
              <path d="M12 18h.01" />
              <path d="M9 7.5l2 2 4-4" />
            </svg>
          </div>
          <h1 className="font-display text-xl font-bold text-slate-100">{title}</h1>
        </div>
        {children}
        <button type="button" onClick={onSignOut} className="mt-5 w-full text-center text-xs text-slate-400 hover:text-slate-200">
          Sign out
        </button>
      </div>
    </div>
  );
}

/**
 * The admin's second sign-in step: every staff and admin account sets up an authenticator app
 * (Google Authenticator, Microsoft Authenticator, Authy…) once, then enters its 6-digit code at
 * each sign-in (valid 12 hours). Nothing of the admin shows until the code is accepted; the
 * server refuses every admin API call without it as well.
 */
export function AdminMfaGate({ children, onSignOut }: { children: ReactNode; onSignOut: () => void }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [enrol, setEnrol] = useState<{ qrImage: string; secret: string } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // The signed-in user, read when needed: the check must run on load (and on the timer or a refused call),
  // not every time the sign-in object is handed over again.
  const userRef = useRef(user);
  userRef.current = user;
  const call = useCallback(
    async <T,>(path: string, body?: unknown): Promise<T> => {
      const current = userRef.current;
      if (!current) throw new Error('Sign in again to continue.');
      const res = await fetch(path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${await current.getIdToken()}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
        ...(body !== undefined && { body: JSON.stringify(body) }),
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => null)) as { error?: { message?: string } | string } | null;
      if (!res.ok) {
        const e = json?.error;
        throw new Error(typeof e === 'string' ? e : e?.message ?? 'Something went wrong. Try again.');
      }
      return json as T;
    },
    []
  );

  const refresh = useCallback(async () => {
    try {
      setStatus(await call<Status>('/api/admin/mfa'));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check the sign-in.');
    }
  }, [call]);

  useEffect(() => {
    void refresh();
    const again = () => void refresh();
    window.addEventListener(ADMIN_REVERIFY_EVENT, again);
    // The 12-hour proof can run out while the admin is open: check again every 10 minutes.
    const timer = window.setInterval(again, 10 * 60_000);
    return () => {
      window.removeEventListener(ADMIN_REVERIFY_EVENT, again);
      window.clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [status?.enrolled, enrol, useRecovery]);

  const startEnrol = async () => {
    setBusy(true);
    setError(null);
    try {
      setEnrol(await call<{ qrImage: string; secret: string }>('/api/admin/mfa/enrol', {}));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the set-up.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (kind: 'confirm' | 'verify') => {
    setBusy(true);
    setError(null);
    try {
      if (kind === 'confirm') {
        const r = await call<{ recoveryCodes: string[] }>('/api/admin/mfa/enrol/confirm', { code });
        setRecoveryCodes(r.recoveryCodes);
      } else {
        await call('/api/admin/mfa/verify', { code });
        await refresh();
      }
      setCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code did not work.');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const downloadCodes = () => {
    if (!recoveryCodes) return;
    const text = `KarthysGallery admin — recovery codes for ${status?.account ?? 'your account'}\nEach code works once, if you lose your phone.\n\n${recoveryCodes.join('\n')}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'karthysgallery-admin-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (status?.verified && !recoveryCodes) return <>{children}</>;

  if (!status) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        {error ? (
          <Shell title="Could not check the sign-in" onSignOut={onSignOut}>
            <p className="mb-4 text-center text-sm text-slate-300">{error}</p>
            <button type="button" className={primary} onClick={() => void refresh()}>
              Try again
            </button>
          </Shell>
        ) : (
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" aria-label="Checking sign-in" />
        )}
      </div>
    );
  }

  // Just enrolled: show the recovery codes once.
  if (recoveryCodes) {
    return (
      <Shell title="Save your recovery codes" onSignOut={onSignOut}>
        <p className="mb-4 text-center text-sm text-slate-300">If you lose your phone, each of these codes lets you in once. Keep them somewhere safe — not on the same phone.</p>
        <ol className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-sm text-slate-100">
          {recoveryCodes.map((c) => (
            <li key={c} className="text-center tracking-wider">
              {c}
            </li>
          ))}
        </ol>
        <div className="mb-4 flex gap-2">
          <button type="button" onClick={downloadCodes} className="h-10 flex-1 rounded-xl border border-slate-700 text-xs font-semibold text-slate-200 hover:bg-slate-800">
            Download
          </button>
          <button type="button" onClick={() => void navigator.clipboard?.writeText(recoveryCodes.join('\n'))} className="h-10 flex-1 rounded-xl border border-slate-700 text-xs font-semibold text-slate-200 hover:bg-slate-800">
            Copy
          </button>
        </div>
        <label className="mb-4 flex items-start gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-0.5 accent-amber-500" />I have saved these codes somewhere safe.
        </label>
        <button
          type="button"
          disabled={!saved}
          className={primary}
          onClick={async () => {
            setRecoveryCodes(null);
            await refresh();
          }}
        >
          Continue to the admin
        </button>
      </Shell>
    );
  }

  // Not set up yet: install an app, scan, confirm.
  if (!status.enrolled) {
    return (
      <Shell title="Set up your authenticator app" onSignOut={onSignOut}>
        {!enrol ? (
          <>
            <p className="mb-4 text-center text-sm text-slate-300">
              For the admin&rsquo;s safety, every sign-in also needs a code from an app on your phone. It takes one minute, once.
            </p>
            <ol className="mb-5 space-y-2 text-sm text-slate-300">
              <li>
                <strong className="text-slate-100">1.</strong> Install <strong className="text-slate-100">Google Authenticator</strong> or <strong className="text-slate-100">Microsoft Authenticator</strong> (free) on your phone.
              </li>
              <li>
                <strong className="text-slate-100">2.</strong> Scan the QR code shown next.
              </li>
              <li>
                <strong className="text-slate-100">3.</strong> Type the 6-digit code the app shows.
              </li>
            </ol>
            {error && <p className="mb-3 rounded-lg bg-rose-950/40 px-3 py-2 text-center text-xs text-rose-300">{error}</p>}
            <button type="button" disabled={busy} className={primary} onClick={() => void startEnrol()}>
              {busy ? 'Preparing…' : 'Show the QR code'}
            </button>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit('confirm');
            }}
          >
            <p className="mb-2 rounded-lg bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-200">
              Already see an entry named <strong>KarthysGallery Admin</strong> in your app? <strong>Delete it first</strong> — this is a new code.
            </p>
            <p className="mb-3 text-center text-sm text-slate-300">In the app, tap <strong className="text-slate-100">+</strong> → <strong className="text-slate-100">Scan a QR code</strong>:</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enrol.qrImage} alt="QR code to scan with your authenticator app" style={{ imageRendering: 'pixelated' }} className="mx-auto mb-3 w-64 max-w-full rounded-xl bg-white p-3" />
            <div className="mb-4 rounded-xl border border-slate-700 bg-slate-950 p-3 text-center">
              <p className="text-xs text-slate-400">Can&rsquo;t scan? In the app choose <strong className="text-slate-200">Enter a setup key</strong>, name it <em>KarthysGallery Admin</em>, type of key <strong className="text-slate-200">Time based</strong>, and type:</p>
              <code className="mt-2 block select-all font-mono text-lg font-semibold tracking-widest text-amber-300" aria-label={`Setup key: ${enrol.secret}`}>
                <span data-testid="setup-key" className="sr-only">{enrol.secret}</span>
                {enrol.secret.split(' ').map((group, i) => (
                  <span key={i} aria-hidden="true" className="mx-1.5 inline-block">{group}</span>
                ))}
              </code>
              <button type="button" onClick={() => void navigator.clipboard?.writeText(enrol.secret.replace(/\s/g, ''))} className="mt-2 h-8 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-200 hover:bg-slate-800">
                Copy key
              </button>
            </div>
            <label className="mb-1 block text-center text-xs font-semibold text-slate-400" htmlFor="mfa-code">
              Code from the app
            </label>
            <input
              id="mfa-code"
              ref={inputRef}
              className={codeInput}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            {error && <p className="mt-3 rounded-lg bg-rose-950/40 px-3 py-2 text-center text-xs text-rose-300">{error}</p>}
            <button type="submit" disabled={busy || code.length !== 6} className={`${primary} mt-4`}>
              {busy ? 'Checking…' : 'Turn on'}
            </button>
            <button type="button" onClick={() => void startEnrol()} className="mt-3 w-full text-center text-xs text-amber-400 hover:text-amber-300">
              Start again with a new QR code
            </button>
          </form>
        )}
      </Shell>
    );
  }

  // Set up: enter today's code.
  return (
    <Shell title="Enter your authenticator code" onSignOut={onSignOut}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit('verify');
        }}
      >
        <p className="mb-4 text-center text-sm text-slate-300">
          {useRecovery ? 'Type one of your saved recovery codes.' : 'Open your authenticator app and type the 6-digit code for KarthysGallery Admin.'}
        </p>
        {status.lockedUntil && <p className="mb-3 rounded-lg bg-rose-950/40 px-3 py-2 text-center text-xs text-rose-300">Too many wrong codes. Try again after {new Date(status.lockedUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</p>}
        <input
          ref={inputRef}
          aria-label={useRecovery ? 'Recovery code' : 'Authenticator code'}
          className={useRecovery ? `${codeInput} tracking-[0.2em] text-lg` : codeInput}
          inputMode={useRecovery ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          maxLength={useRecovery ? 9 : 6}
          placeholder={useRecovery ? 'XXXX-XXXX' : '000000'}
          value={code}
          onChange={(e) => setCode(useRecovery ? e.target.value.toUpperCase().slice(0, 9) : e.target.value.replace(/\D/g, '').slice(0, 6))}
        />
        {error && <p className="mt-3 rounded-lg bg-rose-950/40 px-3 py-2 text-center text-xs text-rose-300">{error}</p>}
        <button type="submit" disabled={busy || (useRecovery ? code.replace(/[^A-Z0-9]/g, '').length !== 8 : code.length !== 6)} className={`${primary} mt-4`}>
          {busy ? 'Checking…' : 'Continue'}
        </button>
        <button
          type="button"
          onClick={() => {
            setUseRecovery((v) => !v);
            setCode('');
            setError(null);
          }}
          className="mt-3 w-full text-center text-xs text-amber-400 hover:text-amber-300"
        >
          {useRecovery ? 'Use the code from the app instead' : 'Lost your phone? Use a recovery code'}
        </button>
      </form>
    </Shell>
  );
}

'use client';

import { PhoneSignIn } from '../auth/PhoneSignIn';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Signed-in users never see this modal — the header links straight to
// /account instead of opening it (see Header.tsx) — so this only ever
// needs to render the sign-in flow.
export function AccountModal({ isOpen, onClose }: AccountModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="account-modal">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      {/* [FE-44] role="dialog"/aria-modal/aria-labelledby were missing —
          same gap as CartDrawer, fixed the same way. */}
      <div role="dialog" aria-modal="true" aria-labelledby="account-modal-title" className="relative bg-paper w-full max-w-sm rounded-2xl border border-line p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 id="account-modal-title" className="text-lg font-semibold text-ink">Sign in</h2>
            <p className="mt-0.5 text-sm text-ink/60">We&rsquo;ll text you a one-time code.</p>
          </div>
          <button aria-label="Close sign in" onClick={onClose} className="text-ink/60 hover:text-ink text-lg leading-none">
            ✕
          </button>
        </div>
        <PhoneSignIn onSignedIn={onClose} />
      </div>
    </div>
  );
}

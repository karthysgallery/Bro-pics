'use client';

import { PhoneSignIn } from '../auth/PhoneSignIn';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AccountModal({ isOpen, onClose }: AccountModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="account-modal">
      <div className="absolute inset-0 bg-charcoal/40" onClick={onClose} />
      <div className="relative bg-cream w-full max-w-sm rounded p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl">Sign in</h2>
          <button aria-label="Close sign in" onClick={onClose} className="text-charcoal">
            ✕
          </button>
        </div>
        <PhoneSignIn onSignedIn={onClose} />
      </div>
    </div>
  );
}

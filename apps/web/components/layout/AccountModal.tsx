'use client';

import Link from 'next/link';
import { PhoneSignIn } from '../auth/PhoneSignIn';
import { useAuth } from '../../lib/auth-context';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AccountModal({ isOpen, onClose }: AccountModalProps) {
  const { user, signOut } = useAuth();
  if (!isOpen) return null;

  const handleSignOut = () => {
    signOut();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="account-modal">
      <div className="absolute inset-0 bg-charcoal/40" onClick={onClose} />
      <div className="relative bg-cream w-full max-w-sm rounded p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl">{user ? 'My account' : 'Sign in'}</h2>
          <button
            aria-label={user ? 'Close account menu' : 'Close sign in'}
            onClick={onClose}
            className="text-charcoal"
          >
            ✕
          </button>
        </div>
        {user ? (
          <div className="flex flex-col gap-3">
            <p>{user.phoneNumber}</p>
            <Link href="/orders" className="text-sage underline" onClick={onClose}>
              My Orders
            </Link>
            <button onClick={handleSignOut} className="rounded bg-charcoal text-cream px-4 py-2 w-fit">
              Sign Out
            </button>
          </div>
        ) : (
          <PhoneSignIn onSignedIn={onClose} />
        )}
      </div>
    </div>
  );
}

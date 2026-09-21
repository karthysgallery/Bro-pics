'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getFirestore, doc, deleteDoc } from 'firebase/firestore';
import {
  getAuth,
  RecaptchaVerifier,
  reauthenticateWithPhoneNumber,
  deleteUser,
  type ConfirmationResult,
} from 'firebase/auth';
import { useAuth } from '../../lib/auth-context';
import { getFirebaseApp } from '../../lib/firebase-client';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';

type DeleteStep = 'idle' | 'confirming' | 'awaiting-otp' | 'deleting';

// Grouped together as the spec's "Privacy & Security" section: logout from
// all other devices, and permanent account deletion. Both are destructive
// or security-sensitive, so both require an explicit confirmation step
// before acting.
export function PrivacyAndSecurity() {
  const { user, signOut } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  const [revoking, setRevoking] = useState(false);
  const [revokeMessage, setRevokeMessage] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const [deleteStep, setDeleteStep] = useState<DeleteStep>('idle');
  const [isStartingDelete, setIsStartingDelete] = useState(false);
  const [otp, setOtp] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const recaptchaContainerRef = useRef<HTMLDivElement>(null);
  const verifierRef = useRef<RecaptchaVerifier | null>(null);

  if (!user) return null;

  const handleRevokeSessions = async () => {
    setRevoking(true);
    setRevokeError(null);
    setRevokeMessage(null);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/auth/revoke-sessions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!response.ok) {
        setRevokeError('Could not sign out other devices. Try again.');
        showToast('Could not sign out other devices. Try again.', 'error');
        return;
      }
      setRevokeMessage('Signed out everywhere. Signing you out here too…');
      showToast('Signed out everywhere', 'success');
      // A revoked refresh token doesn't invalidate an already-issued ID
      // token until it expires on its own, so this device is signed out
      // explicitly rather than left in a stale-but-still-working state.
      await signOut();
      router.push('/');
    } finally {
      setRevoking(false);
    }
  };

  const handleStartDelete = async () => {
    setDeleteError(null);
    setIsStartingDelete(true);
    try {
      verifierRef.current?.clear();
      const auth = getAuth(getFirebaseApp());
      const verifier = new RecaptchaVerifier(auth, recaptchaContainerRef.current!, { size: 'invisible' });
      verifierRef.current = verifier;
      const phoneNumber = user.phoneNumber;
      if (!phoneNumber) {
        setDeleteError('No phone number on file for re-authentication.');
        return;
      }
      const result = await reauthenticateWithPhoneNumber(user, phoneNumber, verifier);
      confirmationRef.current = result;
      setDeleteStep('awaiting-otp');
    } catch {
      setDeleteError('Could not send a verification code. Try again.');
    } finally {
      setIsStartingDelete(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmationRef.current) return;
    setDeleteError(null);
    setDeleteStep('deleting');
    try {
      await confirmationRef.current.confirm(otp);
      const db = getFirestore(getFirebaseApp());
      // Deletes the auth account and the owner-writable profile doc only.
      // What happens to orders/reviews/addresses afterward is a
      // data-retention policy decision, not built here — see the backend
      // requirements doc.
      await deleteDoc(doc(db, 'users', user.uid));
      await deleteUser(user);
      router.push('/');
    } catch {
      setDeleteError('Incorrect code. Try again.');
      showToast('Incorrect code. Try again.', 'error');
      setDeleteStep('awaiting-otp');
    }
  };

  return (
    <div className="border-t border-line pt-6 flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-ink">Privacy &amp; security</h2>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-ink">Sessions</h3>
        <p className="text-sm text-ink/60">Sign out of this account everywhere else it&apos;s currently signed in.</p>
        <button
          onClick={handleRevokeSessions}
          disabled={revoking}
          className="rounded-md border border-line text-ink px-4 py-2 text-sm font-semibold hover:border-accent hover:text-accent transition-colors w-fit disabled:opacity-50"
        >
          {revoking ? 'Signing out everywhere…' : 'Log out of all devices'}
        </button>
        {revokeMessage && <p className="text-sm text-ink/60">{revokeMessage}</p>}
        {revokeError && <p className="text-sm text-alert">{revokeError}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-ink">Delete account</h3>
        <p className="text-sm text-ink/60">
          This permanently deletes your sign-in and profile. It does not delete your past orders or reviews.
        </p>

        {deleteStep === 'idle' && (
          <button
            onClick={() => setDeleteStep('confirming')}
            className="rounded-md border border-alert text-alert px-4 py-2 text-sm font-semibold hover:bg-alert hover:text-paper transition-colors w-fit"
          >
            Delete my account
          </button>
        )}

        <ConfirmDialog
          isOpen={deleteStep === 'confirming'}
          title="Delete your account?"
          message={`This can't be undone. We'll send a verification code to ${user.phoneNumber} to confirm it's you.`}
          confirmLabel="Send code & delete"
          isLoading={isStartingDelete}
          onConfirm={handleStartDelete}
          onCancel={() => setDeleteStep('idle')}
        />

        {(deleteStep === 'awaiting-otp' || deleteStep === 'deleting') && (
          <div className="rounded-lg border border-alert/40 p-4 flex flex-col gap-3">
            <label htmlFor="delete-otp" className="text-sm font-medium text-ink">Enter verification code</label>
            <input
              id="delete-otp"
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="rounded-md border border-line px-3 py-2 text-sm text-ink w-fit"
            />
            <button
              onClick={handleConfirmDelete}
              disabled={deleteStep === 'deleting'}
              className="rounded-md bg-alert text-paper px-4 py-2 text-sm font-semibold w-fit disabled:opacity-50"
            >
              {deleteStep === 'deleting' ? 'Deleting…' : 'Confirm delete'}
            </button>
          </div>
        )}

        {deleteError && <p className="text-sm text-alert">{deleteError}</p>}
      </div>

      <div ref={recaptchaContainerRef} />
    </div>
  );
}

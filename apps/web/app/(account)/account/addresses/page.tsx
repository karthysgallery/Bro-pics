'use client';

import { useEffect, useState } from 'react';
import { SignedOutNotice } from '../../../../components/account/SignedOutNotice';
import Link from 'next/link';
import { getFirestore, collection, getDocs, deleteDoc, doc, setDoc } from 'firebase/firestore';
import type { Address } from '@bro-pics/shared';
import { useAuth } from '../../../../lib/auth-context';
import { getFirebaseApp } from '../../../../lib/firebase-client';
import { AddressForm } from '../../../../components/checkout/AddressForm';
import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';
import { PageSkeleton } from '../../../../components/ui/Skeleton';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { useToast } from '../../../../components/ui/Toast';
import { Card } from '../../../../components/ui/Card';

const ADDRESS_TYPE_LABEL: Record<string, string> = { home: 'Home', work: 'Work', other: 'Other' };

export default function AddressesPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = () => {
    if (!user) return;
    const db = getFirestore(getFirebaseApp());
    getDocs(collection(db, 'users', user.uid, 'addresses')).then((snapshot) => {
      setAddresses(snapshot.docs.map((d) => d.data() as Address));
    });
  };

  // Depends on user?.uid (a stable primitive), not the whole `user` object
  // — matching orders/page.tsx and reviews/page.tsx's own effects. The
  // Firebase User object is a fresh reference on every AuthProvider
  // re-render even when signed-in state hasn't actually changed, so
  // depending on the object itself would re-fetch addresses far more often
  // than intended.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [user?.uid]);

  if (!user) return <SignedOutNotice action="manage your addresses" />;

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId || !addresses) return;
    setIsDeleting(true);
    try {
      const db = getFirestore(getFirebaseApp());
      const deletedWasDefault = addresses.find((a) => a.id === pendingDeleteId)?.isDefault ?? false;
      await deleteDoc(doc(db, 'users', user.uid, 'addresses', pendingDeleteId));
      const remaining = addresses.filter((a) => a.id !== pendingDeleteId);

      // [FE-35] Deleting the default address used to leave NO address
      // marked default — checkout's own AddressPicker falls back to
      // `loaded[0]` so it kept working either way, but this page then
      // showed no "(Default)" badge on anything until the customer
      // noticed and picked one manually. The first remaining address is
      // promoted automatically instead.
      if (deletedWasDefault && remaining.length > 0) {
        const promoted = remaining[0];
        await setDoc(doc(db, 'users', user.uid, 'addresses', promoted.id), { ...promoted, isDefault: true });
        setAddresses(remaining.map((a) => (a.id === promoted.id ? { ...a, isDefault: true } : a)));
      } else {
        setAddresses(remaining);
      }
      showToast('Address deleted', 'success');
    } finally {
      setIsDeleting(false);
      setPendingDeleteId(null);
    }
  };

  const handleSetDefault = async (addressId: string) => {
    if (!addresses) return;
    const db = getFirestore(getFirebaseApp());
    await Promise.all(
      addresses.map((a) => setDoc(doc(db, 'users', user.uid, 'addresses', a.id), { ...a, isDefault: a.id === addressId }))
    );
    setAddresses(addresses.map((a) => ({ ...a, isDefault: a.id === addressId })));
    showToast('Default address updated', 'success');
  };

  if (addresses === null) return <PageSkeleton rows={3} />;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 md:px-6 py-8 flex flex-col gap-4">
      <Link href="/account" className="text-sm text-accent/60 hover:text-accent-dark w-fit">
        ← Back to account
      </Link>
      <h1 className="text-2xl font-semibold text-ink">Addresses</h1>

      {addresses.length === 0 && !showNewForm ? (
        <EmptyState
          title="No saved addresses yet"
          message="Add an address so checkout only takes a couple of taps."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {addresses.map((address) =>
            editingId === address.id ? (
              <Card as="li" key={address.id}>
                <AddressForm
                  userId={user.uid}
                  existingAddress={address}
                  onSaved={() => {
                    setEditingId(null);
                    load();
                    showToast('Address saved', 'success');
                  }}
                  onCancel={() => setEditingId(null)}
                />
              </Card>
            ) : (
              <Card as="li" key={address.id} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  {address.type && (
                    <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                      {ADDRESS_TYPE_LABEL[address.type]}
                    </span>
                  )}
                  <span className="font-medium text-accent-dark">
                    {address.label ? `${address.label} ` : ''}
                    {address.isDefault && <span className="text-xs text-accent-dark">(Default)</span>}
                  </span>
                </div>
                <p className="text-sm text-accent/80">
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ''}, {address.city}, {address.state} {address.pincode}
                  {address.country ? `, ${address.country}` : ''}
                </p>
                <p className="text-sm text-accent/60">{address.phone}</p>
                {address.deliveryInstructions && (
                  <p className="text-sm text-accent/60 italic">&ldquo;{address.deliveryInstructions}&rdquo;</p>
                )}
                <div className="flex gap-3 text-sm">
                  <button onClick={() => setEditingId(address.id)} className="underline text-accent">
                    Edit
                  </button>
                  <button onClick={() => setPendingDeleteId(address.id)} className="underline text-accent">
                    Delete
                  </button>
                  {!address.isDefault && (
                    <button onClick={() => handleSetDefault(address.id)} className="underline text-accent">
                      Set as default
                    </button>
                  )}
                </div>
              </Card>
            )
          )}
        </ul>
      )}

      {showNewForm ? (
        <Card>
          <AddressForm
            userId={user.uid}
            onSaved={() => {
              setShowNewForm(false);
              load();
              showToast('Address saved', 'success');
            }}
            onCancel={() => setShowNewForm(false)}
            isFirstAddress={addresses.length === 0}
          />
        </Card>
      ) : (
        <button
          onClick={() => setShowNewForm(true)}
          className="rounded-full bg-gold text-ink px-5 py-2.5 text-sm font-semibold hover:bg-gold-deep transition-colors w-fit"
        >
          Add a new address
        </button>
      )}

      <ConfirmDialog
        isOpen={pendingDeleteId !== null}
        title="Delete this address?"
        message="This can't be undone."
        confirmLabel="Delete"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </main>
  );
}

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
    <main className="mx-auto w-full max-w-shell px-4 md:px-6 py-6 md:py-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-xs text-ink/50 mb-4">
        <Link href="/account" className="hover:text-ink">Account</Link>
        {' · '}
        <span className="text-ink font-medium">Addresses</span>
      </nav>

      <div className="mb-6">
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-ink mb-2">Your delivery addresses.</h1>
        <p className="text-sm text-ink/70">Keep your favourite places ready for your next frame.</p>
      </div>

      {/* Navigation tabs */}
      <div className="flex items-center gap-2 mb-8">
        <Link href="/account" className="px-4 py-2 rounded-full border border-line bg-surface text-xs font-semibold text-ink hover:bg-tint/40 transition-colors">
          Overview & profile
        </Link>
        <Link href="/orders" className="px-4 py-2 rounded-full border border-line bg-surface text-xs font-semibold text-ink hover:bg-tint/40 transition-colors">
          Orders
        </Link>
        <span className="px-4 py-2 rounded-full bg-ink text-surface text-xs font-semibold">
          Addresses
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Addresses List */}
        <div className={showNewForm || editingId ? 'lg:col-span-6 space-y-4' : 'lg:col-span-12 space-y-6'}>
          {addresses.length === 0 && !showNewForm ? (
            <EmptyState
              title="No saved addresses yet"
              message="Add an address so checkout only takes a couple of taps."
            />
          ) : (
            <ul className={showNewForm || editingId ? 'space-y-4' : 'grid grid-cols-1 md:grid-cols-2 gap-6'}>
              {addresses.map((address) => (
                <li key={address.id} className="rounded-3xl border border-line bg-surface p-6 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <h2 className="font-display text-base font-bold text-ink">
                        {address.label || ADDRESS_TYPE_LABEL[address.type ?? ''] || 'Address'}
                      </h2>
                      {address.isDefault && (
                        <span className="px-3 py-1 rounded-full text-2xs font-semibold border border-line bg-tint/60 text-ink">
                          Default address <span className="sr-only">(Default)</span>
                        </span>
                      )}
                    </div>
                    {address.label && address.type && (
                      <span className="inline-block text-2xs font-semibold px-2.5 py-0.5 rounded-full bg-accent/10 text-accent mb-2">
                        {ADDRESS_TYPE_LABEL[address.type]}
                      </span>
                    )}
                    <p className="text-xs text-ink/80 font-medium mb-1">
                      {address.line1}{address.line2 ? `, ${address.line2}` : ''}
                    </p>
                    <p className="text-xs text-ink/70 mb-2">
                      {address.city}, {address.state} {address.pincode}
                      {address.country ? `, ${address.country}` : ''}
                    </p>
                    <p className="text-xs text-ink/60 mb-2">{address.phone}</p>
                    {address.deliveryInstructions && (
                      <p className="text-xs text-ink/50 italic mb-2">&ldquo;{address.deliveryInstructions}&rdquo;</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-4 mt-2 border-t border-line">
                    <button
                      onClick={() => {
                        setShowNewForm(false);
                        setEditingId(address.id);
                      }}
                      className="px-4 py-1.5 rounded-full border border-line bg-surface hover:bg-tint/40 text-xs font-semibold text-ink transition-colors"
                    >
                      Edit address
                    </button>
                    <button
                      onClick={() => setPendingDeleteId(address.id)}
                      className="px-4 py-1.5 rounded-full border border-line bg-surface hover:bg-tint/40 text-xs font-semibold text-ink transition-colors"
                    >
                      Delete
                    </button>
                    {!address.isDefault && (
                      <button
                        onClick={() => handleSetDefault(address.id)}
                        className="px-4 py-1.5 rounded-full border border-line bg-surface hover:bg-tint/40 text-xs font-semibold text-ink transition-colors"
                      >
                        Set as default
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {!showNewForm && !editingId && (
            <button
              onClick={() => setShowNewForm(true)}
              className="rounded-full bg-gold text-ink px-6 py-3 text-xs font-semibold hover:bg-gold-deep transition-colors shadow-sm"
            >
              + Add a new address
            </button>
          )}
        </div>

        {/* Right Column: Add / Edit Address Card */}
        {(showNewForm || editingId) && (
          <div className="lg:col-span-6">
            <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
              <h2 className="font-display text-base font-bold text-ink mb-4">
                {editingId ? 'Edit address' : 'Add an address'}
              </h2>
              <AddressForm
                userId={user.uid}
                existingAddress={editingId ? addresses.find((a) => a.id === editingId) : undefined}
                onSaved={() => {
                  setEditingId(null);
                  setShowNewForm(false);
                  load();
                  showToast(editingId ? 'Address updated' : 'Address saved', 'success');
                }}
                onCancel={() => {
                  setEditingId(null);
                  setShowNewForm(false);
                }}
                isFirstAddress={addresses.length === 0}
              />
            </div>
          </div>
        )}
      </div>

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

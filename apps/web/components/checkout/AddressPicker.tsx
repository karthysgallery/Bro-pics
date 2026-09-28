'use client';

import { useEffect, useState } from 'react';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import type { Address } from '@bro-pics/shared';
import { getFirebaseApp } from '../../lib/firebase-client';
import { AddressForm } from './AddressForm';
import { Skeleton } from '../ui/Skeleton';

const TYPE_LABEL: Record<string, string> = { home: 'Home', work: 'Work', other: 'Other' };

interface AddressPickerProps {
  userId: string;
  onSelect: (addressId: string) => void;
  // [FE-33] Optional — lets a caller (checkout) react to the full selected
  // Address (its pincode, for the delivery-estimate check) without every
  // existing caller/test that only wants the id needing to change.
  onSelectAddress?: (address: Address) => void;
}

export function AddressPicker({ userId, onSelect, onSelectAddress }: AddressPickerProps) {
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const db = getFirestore(getFirebaseApp());
    getDocs(collection(db, 'users', userId, 'addresses')).then((snapshot) => {
      const loaded = snapshot.docs.map((d) => d.data() as Address);
      setAddresses(loaded);
      const preferred = loaded.find((a) => a.isDefault) ?? loaded[0];
      if (preferred) {
        setSelectedId(preferred.id);
        onSelect(preferred.id);
        onSelectAddress?.(preferred);
      } else {
        setShowForm(true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    onSelect(id);
    const address = addresses?.find((a) => a.id === id);
    if (address) onSelectAddress?.(address);
  };

  const handleNewAddressSaved = (address: Address) => {
    setAddresses((prev) => [...(prev ?? []), address]);
    setShowForm(false);
    setSelectedId(address.id);
    onSelect(address.id);
    onSelectAddress?.(address);
  };

  if (addresses === null) {
    return (
      <div className="flex flex-col gap-2" role="status" aria-label="Loading addresses">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-2/3" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {addresses.map((address) => (
        <label key={address.id} className="flex items-center gap-2">
          <input
            type="radio"
            name="address"
            checked={selectedId === address.id}
            onChange={() => handleSelect(address.id)}
          />
          {address.type && (
            <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-accent/10 text-accent shrink-0">
              {TYPE_LABEL[address.type]}
            </span>
          )}
          {address.label ? `${address.label} — ` : ''}
          {address.line1}, {address.city}, {address.state} {address.pincode}
        </label>
      ))}

      {!showForm && (
        <button onClick={() => setShowForm(true)} className="text-sm underline w-fit">
          Add a new address
        </button>
      )}
      {showForm && <AddressForm userId={userId} onSaved={handleNewAddressSaved} onCancel={() => setShowForm(false)} />}
    </div>
  );
}

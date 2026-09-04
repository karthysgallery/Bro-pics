'use client';

import { useEffect, useState } from 'react';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import type { Address } from '@bro-pics/shared';
import { getFirebaseApp } from '../../lib/firebase-client';
import { AddressForm } from './AddressForm';

interface AddressPickerProps {
  userId: string;
  onSelect: (addressId: string) => void;
}

export function AddressPicker({ userId, onSelect }: AddressPickerProps) {
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
      } else {
        setShowForm(true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    onSelect(id);
  };

  const handleNewAddressSaved = (address: Address) => {
    setAddresses((prev) => [...(prev ?? []), address]);
    setShowForm(false);
    handleSelect(address.id);
  };

  if (addresses === null) return <p>Loading addresses…</p>;

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

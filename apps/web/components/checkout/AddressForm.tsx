'use client';

import { useState } from 'react';
import { getFirestore, doc, collection, setDoc } from 'firebase/firestore';
import { AddressSchema, type Address } from '@bro-pics/shared';
import { getFirebaseApp } from '../../lib/firebase-client';

interface AddressFormProps {
  userId: string;
  onSaved: (address: Address) => void;
  onCancel?: () => void;
}

export function AddressForm({ userId, onSaved, onCancel }: AddressFormProps) {
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [phone, setPhone] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    const db = getFirestore(getFirebaseApp());
    collection(db, 'users', userId, 'addresses');
    const addressId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `addr_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const candidate = {
      id: addressId,
      label: label || null,
      line1,
      line2: line2 || null,
      city,
      state,
      pincode,
      phone,
      isDefault: false,
    };

    const parsed = AddressSchema.safeParse(candidate);
    if (!parsed.success) {
      setError('Please fill in address line 1, city, state, pincode, and phone.');
      return;
    }

    await setDoc(doc(db, 'users', userId, 'addresses', addressId), parsed.data);
    onSaved(parsed.data);
  };

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="address-label">Label (optional)</label>
      <input id="address-label" value={label} onChange={(e) => setLabel(e.target.value)} className="rounded border border-charcoal/20 px-3 py-2" />

      <label htmlFor="address-line1">Address line 1</label>
      <input id="address-line1" value={line1} onChange={(e) => setLine1(e.target.value)} className="rounded border border-charcoal/20 px-3 py-2" />

      <label htmlFor="address-line2">Address line 2 (optional)</label>
      <input id="address-line2" value={line2} onChange={(e) => setLine2(e.target.value)} className="rounded border border-charcoal/20 px-3 py-2" />

      <label htmlFor="address-city">City</label>
      <input id="address-city" value={city} onChange={(e) => setCity(e.target.value)} className="rounded border border-charcoal/20 px-3 py-2" />

      <label htmlFor="address-state">State</label>
      <input id="address-state" value={state} onChange={(e) => setState(e.target.value)} className="rounded border border-charcoal/20 px-3 py-2" />

      <label htmlFor="address-pincode">Pincode</label>
      <input id="address-pincode" value={pincode} onChange={(e) => setPincode(e.target.value)} className="rounded border border-charcoal/20 px-3 py-2" />

      <label htmlFor="address-phone">Phone</label>
      <input id="address-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded border border-charcoal/20 px-3 py-2" />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button onClick={handleSave} className="rounded bg-charcoal text-cream px-4 py-2">
          Save address
        </button>
        {onCancel && (
          <button onClick={onCancel} className="rounded border border-charcoal/20 px-4 py-2">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

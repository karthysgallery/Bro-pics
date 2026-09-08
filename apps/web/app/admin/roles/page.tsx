'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../../lib/auth-context';

interface LookupResult {
  uid: string;
  phoneNumber: string;
  role: string | null;
}

export default function AdminRolesPage() {
  const { user } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [roleInput, setRoleInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setAuthorized(false);
      return;
    }
    user
      .getIdTokenResult()
      .then((result) => setAuthorized(result.claims.role === 'admin'))
      .catch(() => setAuthorized(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  if (authorized === null) return null;
  if (!authorized) return <p>Not authorized.</p>;

  const handleLookup = async () => {
    setError(null);
    setResult(null);
    const idToken = await user!.getIdToken();
    const response = await fetch(`/api/admin/users/lookup?phone=${encodeURIComponent(phoneInput)}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!response.ok) {
      setError('No account with that phone number.');
      return;
    }
    const body = await response.json();
    setResult(body);
    setRoleInput(body.role ?? '');
  };

  const handleSave = async () => {
    if (!result) return;
    setError(null);
    const idToken = await user!.getIdToken();
    const response = await fetch(`/api/admin/users/${result.uid}/role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ role: roleInput || null }),
    });
    if (!response.ok) {
      setError('Could not update the role.');
      return;
    }
    const body = await response.json();
    setResult({ ...result, role: body.role });
  };

  return (
    <main className="flex flex-col gap-4 p-6">
      <h1 className="font-display text-2xl">Role Management</h1>

      <label htmlFor="phone-lookup-input">Phone number</label>
      <input
        id="phone-lookup-input"
        aria-label="Phone number"
        value={phoneInput}
        onChange={(e) => setPhoneInput(e.target.value)}
        className="rounded border border-charcoal/20 px-3 py-2 w-fit"
      />
      <button onClick={handleLookup} className="rounded bg-charcoal text-cream px-4 py-2 w-fit">
        Look up
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="flex flex-col gap-3 pt-4 border-t border-charcoal/10">
          <p>{result.phoneNumber}</p>
          <p>Current role: {result.role ?? 'None'}</p>

          <label htmlFor="role-select">Role</label>
          <select
            id="role-select"
            aria-label="Role"
            value={roleInput}
            onChange={(e) => setRoleInput(e.target.value)}
            className="rounded border border-charcoal/20 px-3 py-2 w-fit"
          >
            <option value="">None</option>
            <option value="staff">Support</option>
            <option value="admin">Admin</option>
          </select>

          <button onClick={handleSave} className="rounded bg-charcoal text-cream px-4 py-2 w-fit">
            Save
          </button>
        </div>
      )}
    </main>
  );
}

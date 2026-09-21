'use client';

import { useEffect, useRef, useState } from 'react';
import { SignedOutNotice } from '../../../../components/account/SignedOutNotice';
import Link from 'next/link';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '../../../../lib/auth-context';
import { getFirebaseApp } from '../../../../lib/firebase-client';
import { useToast } from '../../../../components/ui/Toast';
import { PageSkeleton } from '../../../../components/ui/Skeleton';
import type { Gender } from '@bro-pics/shared';

const GENDER_OPTIONS: Array<{ value: Gender; label: string }> = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

export default function ProfilePage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    const db = getFirestore(getFirebaseApp());
    getDoc(doc(db, 'users', user.uid)).then((snapshot) => {
      const data = snapshot.data() as
        | { firstName?: string; lastName?: string; displayName?: string; email?: string; dob?: string; gender?: Gender; photoUrl?: string }
        | undefined;
      // Older accounts only have displayName (no first/last split yet) —
      // fall back to splitting it on the first save rather than losing it.
      if (data?.firstName || data?.lastName) {
        setFirstName(data.firstName ?? '');
        setLastName(data.lastName ?? '');
      } else if (data?.displayName) {
        const [first, ...rest] = data.displayName.split(' ');
        setFirstName(first ?? '');
        setLastName(rest.join(' '));
      }
      setEmail(data?.email ?? '');
      setDob(data?.dob ?? '');
      setGender(data?.gender ?? '');
      setPhotoUrl(data?.photoUrl ?? null);
      setLoaded(true);
    });
  }, [user]);

  if (!user) return <SignedOutNotice action="edit your profile" />;
  if (!loaded) return <PageSkeleton />;

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!firstName.trim()) next.firstName = 'First name is required.';
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Enter a valid email address.';
    if (dob) {
      const parsed = new Date(dob);
      if (Number.isNaN(parsed.getTime()) || parsed > new Date()) next.dob = 'Enter a valid date of birth.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const db = getFirestore(getFirebaseApp());
      const displayName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
      await setDoc(
        doc(db, 'users', user.uid),
        {
          id: user.uid,
          phone: user.phoneNumber ?? '',
          displayName,
          firstName: firstName.trim() || null,
          lastName: lastName.trim() || null,
          email: email.trim() || null,
          dob: dob || null,
          gender: gender || null,
          updatedAt: new Date(),
        },
        { merge: true }
      );
      showToast('Profile saved', 'success');
    } catch {
      showToast('Could not save your profile. Try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoChange = async (file: File | undefined) => {
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const idToken = await user.getIdToken();
      const formData = new FormData();
      formData.set('file', file);
      const response = await fetch('/api/account/profile-picture', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
        body: formData,
      });
      if (!response.ok) {
        showToast('Could not upload photo. Try a different image.', 'error');
        return;
      }
      const body = await response.json();
      setPhotoUrl(body.photoUrl);
      const db = getFirestore(getFirebaseApp());
      await setDoc(doc(db, 'users', user.uid), { photoUrl: body.photoUrl, updatedAt: new Date() }, { merge: true });
      showToast('Photo updated', 'success');
    } finally {
      setUploadingPhoto(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-md px-4 md:px-6 py-8 flex flex-col gap-4">
      <Link href="/account" className="text-sm text-accent/60 hover:text-accent-dark w-fit">
        ← Back to account
      </Link>
      <h1 className="text-2xl font-semibold text-ink">Profile</h1>

      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-tint overflow-hidden shrink-0 flex items-center justify-center text-ink/40 text-xs">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span>No photo</span>
          )}
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handlePhotoChange(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPhoto}
            className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink hover:border-accent disabled:opacity-50"
          >
            {uploadingPhoto ? 'Uploading…' : 'Change photo'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="profile-phone" className="text-sm text-accent/70 flex-1">Phone number</label>
        <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-accent/10 text-accent">Verified</span>
      </div>
      <input
        id="profile-phone"
        value={user.phoneNumber ?? ''}
        disabled
        className="rounded-2xl border border-line bg-accent/10 px-3 py-2 text-accent/60"
      />

      <label htmlFor="profile-first-name" className="text-sm text-accent/70">First name</label>
      <input
        id="profile-first-name"
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
        aria-invalid={!!errors.firstName}
        className="rounded-2xl border border-line px-3 py-2"
      />
      {errors.firstName && <p className="text-sm text-alert">{errors.firstName}</p>}

      <label htmlFor="profile-last-name" className="text-sm text-accent/70">Last name</label>
      <input
        id="profile-last-name"
        value={lastName}
        onChange={(e) => setLastName(e.target.value)}
        className="rounded-2xl border border-line px-3 py-2"
      />

      <label htmlFor="profile-email" className="text-sm text-accent/70">Email</label>
      <input
        id="profile-email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-invalid={!!errors.email}
        className="rounded-2xl border border-line px-3 py-2"
      />
      {errors.email && <p className="text-sm text-alert">{errors.email}</p>}

      <label htmlFor="profile-dob" className="text-sm text-accent/70">Date of birth (optional)</label>
      <input
        id="profile-dob"
        type="date"
        value={dob}
        max={new Date().toISOString().slice(0, 10)}
        onChange={(e) => setDob(e.target.value)}
        aria-invalid={!!errors.dob}
        className="rounded-2xl border border-line px-3 py-2"
      />
      {errors.dob && <p className="text-sm text-alert">{errors.dob}</p>}

      <label htmlFor="profile-gender" className="text-sm text-accent/70">Gender (optional)</label>
      <select
        id="profile-gender"
        value={gender}
        onChange={(e) => setGender(e.target.value as Gender | '')}
        className="rounded-2xl border border-line px-3 py-2 bg-paper"
      >
        <option value="">Prefer not to answer</option>
        {GENDER_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded-full bg-gold text-ink px-5 py-2.5 text-sm font-semibold hover:bg-gold-deep transition-colors w-fit mt-2 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </main>
  );
}

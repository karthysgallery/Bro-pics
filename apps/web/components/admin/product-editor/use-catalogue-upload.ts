'use client';

import { useCallback } from 'react';
import { useAuth } from '../../../lib/auth-context';

export interface UploadedImage {
  id: string;
  url: string;
  width: number;
  height: number;
  alt: string;
}

/** Uploads one picture to the media library through the catalogue route (keeps its real pixel size). */
export function useCatalogueUpload() {
  const { user } = useAuth();
  return useCallback(
    async (file: File, options: { alt?: string; tag?: string } = {}): Promise<UploadedImage> => {
      if (!user) throw new Error('Your session has ended. Sign in again to continue.');
      const form = new FormData();
      form.set('file', file);
      if (options.alt) form.set('alt', options.alt);
      if (options.tag) form.set('tag', options.tag);
      const res = await fetch('/api/admin/catalogue/images', { method: 'POST', body: form, headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const body = (await res.json().catch(() => null)) as { media?: UploadedImage; error?: { message?: string } | string } | null;
      if (!res.ok || !body?.media) {
        const e = body?.error;
        throw new Error(typeof e === 'string' ? e : e?.message ?? 'The picture could not be uploaded.');
      }
      return body.media;
    },
    [user]
  );
}

/** ₹ from paise for inputs ("1299" / "1299.5"), and back. */
export const rupees = (paise: number) => (paise / 100).toFixed(paise % 100 === 0 ? 0 : 2);
export const toPaise = (value: string) => {
  const n = Number(value.replace(/[,₹\s]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};
export const inr = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

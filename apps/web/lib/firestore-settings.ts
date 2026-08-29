import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from './firebase-admin';

export async function getAnnouncementBarSettings(): Promise<{
  text: string;
  link?: string;
} | null> {
  const db = getFirestore(getAdminApp());
  const doc = await db.collection('settings').doc('announcementBar').get();
  if (!doc.exists) return null;

  const data = doc.data();
  if (!data || typeof data.text !== 'string' || data.text.length === 0) return null;

  return {
    text: data.text,
    ...(typeof data.link === 'string' && data.link.length > 0 && { link: data.link }),
  };
}

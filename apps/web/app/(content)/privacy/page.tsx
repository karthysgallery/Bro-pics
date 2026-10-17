import type { Metadata } from 'next';
import { LegalPageView, legalPageMetadata } from '../../../components/content/LegalPageView';

// Shows only the text an administrator approved; otherwise a short holding notice (see LegalPageView).
export const revalidate = 60;

const FALLBACK: Metadata = { title: 'Privacy policy', description: 'What we collect, why, and your choices.' };

export async function generateMetadata(): Promise<Metadata> {
  return legalPageMetadata('privacy', FALLBACK);
}

export default async function PrivacyPage() {
  return <LegalPageView slug="privacy" title="Privacy policy" />;
}

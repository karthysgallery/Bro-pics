import type { Metadata } from 'next';
import { LegalPageView, legalPageMetadata } from '../../../components/content/LegalPageView';

// Shows only the text an administrator approved; otherwise a short holding notice (see LegalPageView).
export const revalidate = 60;

const FALLBACK: Metadata = { title: 'About us', description: 'About the shop.' };

export async function generateMetadata(): Promise<Metadata> {
  return legalPageMetadata('about', FALLBACK);
}

export default async function AboutPage() {
  return <LegalPageView slug="about" title="About us" />;
}

import type { Metadata } from 'next';
import { LegalPageView, legalPageMetadata } from '../../../components/content/LegalPageView';

// Shows only the text an administrator approved; otherwise a short holding notice (see LegalPageView).
export const revalidate = 60;

const FALLBACK: Metadata = { title: 'Contact us', description: 'How to reach us.' };

export async function generateMetadata(): Promise<Metadata> {
  return legalPageMetadata('contact', FALLBACK);
}

export default async function ContactPage() {
  return <LegalPageView slug="contact" title="Contact us" />;
}

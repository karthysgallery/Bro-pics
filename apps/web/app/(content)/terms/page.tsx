import type { Metadata } from 'next';
import { LegalPageView, legalPageMetadata } from '../../../components/content/LegalPageView';

// Shows only the text an administrator approved; otherwise a short holding notice (see LegalPageView).
export const revalidate = 60;

const FALLBACK: Metadata = { title: 'Terms and conditions', description: 'The agreement between you and the shop when you place an order.' };

export async function generateMetadata(): Promise<Metadata> {
  return legalPageMetadata('terms', FALLBACK);
}

export default async function TermsPage() {
  return <LegalPageView slug="terms" title="Terms and conditions" />;
}

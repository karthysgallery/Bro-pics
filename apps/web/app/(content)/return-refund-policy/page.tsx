import type { Metadata } from 'next';
import { LegalPageView, legalPageMetadata } from '../../../components/content/LegalPageView';

// Shows only the text an administrator approved; otherwise a short holding notice (see LegalPageView).
export const revalidate = 60;

const FALLBACK: Metadata = { title: 'Returns, replacement and refund policy', description: 'What we can take back, and what we put right.' };

export async function generateMetadata(): Promise<Metadata> {
  return legalPageMetadata('return-refund-policy', FALLBACK);
}

export default async function ReturnRefundPolicyPage() {
  return <LegalPageView slug="return-refund-policy" title="Returns, replacement and refund policy" />;
}

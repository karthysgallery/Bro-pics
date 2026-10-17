import type { Metadata } from 'next';
import { LegalPageView, legalPageMetadata } from '../../../components/content/LegalPageView';

// Shows only the text an administrator approved; otherwise a short holding notice (see LegalPageView).
export const revalidate = 60;

const FALLBACK: Metadata = { title: 'Cancellation policy', description: 'When an order can be cancelled.' };

export async function generateMetadata(): Promise<Metadata> {
  return legalPageMetadata('cancellation-policy', FALLBACK);
}

export default async function CancellationPolicyPage() {
  return <LegalPageView slug="cancellation-policy" title="Cancellation policy" />;
}

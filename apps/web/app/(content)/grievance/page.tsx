import type { Metadata } from 'next';
import { LegalPageView, legalPageMetadata } from '../../../components/content/LegalPageView';

// Shows only the text an administrator approved; otherwise a short holding notice (see LegalPageView).
export const revalidate = 60;

const FALLBACK: Metadata = { title: 'Grievance and customer support', description: 'How to raise a concern.' };

export async function generateMetadata(): Promise<Metadata> {
  return legalPageMetadata('grievance', FALLBACK);
}

export default async function GrievancePage() {
  return <LegalPageView slug="grievance" title="Grievance and customer support" />;
}

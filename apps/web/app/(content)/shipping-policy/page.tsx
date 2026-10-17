import type { Metadata } from 'next';
import { LegalPageView, legalPageMetadata } from '../../../components/content/LegalPageView';

// Shows only the text an administrator approved; otherwise a short holding notice (see LegalPageView).
export const revalidate = 60;

const FALLBACK: Metadata = { title: 'Shipping and delivery policy', description: 'Shipping charges, dispatch and delivery.' };

export async function generateMetadata(): Promise<Metadata> {
  return legalPageMetadata('shipping-policy', FALLBACK);
}

export default async function ShippingPolicyPage() {
  return <LegalPageView slug="shipping-policy" title="Shipping and delivery policy" />;
}

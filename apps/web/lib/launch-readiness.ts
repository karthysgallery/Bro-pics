import {
  LEGAL_PAGE_SLUGS,
  missingBusinessDetails,
  pageStatus,
  returnsSettingsGaps,
  unconfiguredStates,
  type Page,
  type PublicBusinessDetails,
  type ReturnsSettings,
  type StateShippingSettings,
} from '@bro-pics/shared';

export interface ReadinessItem {
  id: string;
  label: string;
  /** ok = nothing to do; todo = the owner/admin still has to decide or fill something in. */
  status: 'ok' | 'todo';
  /** Plain-language list of what is missing. Counts and labels only: never customer data. */
  details: string[];
}

export interface ReadinessInput {
  profile: PublicBusinessDetails | null;
  shipping: StateShippingSettings;
  returns: ReturnsSettings;
  pages: Array<Pick<Page, 'slug' | 'bodyHtml' | 'isPublished' | 'approvedHash'>>;
  /** Active products with no return policy of their own (they follow their category, or are assumed made-to-order). */
  productsWithoutReturnPolicy: number;
  totalActiveProducts: number;
}

const item = (id: string, label: string, details: string[]): ReadinessItem => ({ id, label, status: details.length === 0 ? 'ok' : 'todo', details });

/** What still stands between the shop and a truthful, complete set of business and policy settings. */
export function computeReadiness(input: ReadinessInput): ReadinessItem[] {
  const { profile, shipping, returns, pages } = input;
  const missingStates = unconfiguredStates(shipping);
  const legal = LEGAL_PAGE_SLUGS.map((slug) => {
    const page = pages.find((p) => p.slug === slug);
    if (!page) return `${slug}: no page yet (start from a template)`;
    const status = pageStatus(page);
    return status === 'published' ? null : `${slug}: ${status === 'approved' ? 'approved but not published' : 'draft, not approved'}`;
  }).filter((v): v is string => v !== null);
  return [
    item('business', 'Business profile', missingBusinessDetails(profile)),
    item(
      'shipping',
      'Shipping charges',
      missingStates.length === 0
        ? []
        : [`${missingStates.length} of the states and union territories outside ${shipping.homeState} have no charge set: customers there cannot check out until you set each charge or a fallback charge`]
    ),
    item('returns', 'Returns and claims', returnsSettingsGaps(returns)),
    item(
      'productPolicies',
      'Product return type',
      input.productsWithoutReturnPolicy === 0
        ? []
        : [`${input.productsWithoutReturnPolicy} of ${input.totalActiveProducts} active products have no return type set: they follow their category, or are treated as made-to-order (no change-of-mind return)`]
    ),
    item('legalPages', 'Policy pages', legal),
  ];
}

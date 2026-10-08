import 'server-only';
import { getPublishedCombos } from './firestore-combos';

type Header = { navLinks: { label: string; href: string }[]; showCategories?: boolean; logoMediaId?: string | null } | null;

/**
 * Adds a "Combo offers" link to the header while at least one combo is published, unless the owner
 * already added a link to /combos themselves. No published combos, or a failed lookup, changes nothing.
 */
export async function withComboNavLink(header: Header): Promise<Header> {
  try {
    const existing = header?.navLinks ?? [];
    if (existing.some((l) => l.href === '/combos' || l.href.startsWith('/combos'))) return header;
    const combos = await getPublishedCombos();
    if (combos.length === 0) return header;
    return { ...(header ?? { showCategories: true }), navLinks: [...existing, { label: 'Combo offers', href: '/combos' }] } as Header;
  } catch {
    return header;
  }
}

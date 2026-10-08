import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
const mockGetPublishedCombos = vi.fn();
vi.mock('./firestore-combos', () => ({ getPublishedCombos: () => mockGetPublishedCombos() }));
import { withComboNavLink } from './combo-nav';

const header = { navLinks: [{ label: 'How it works', href: '/how-it-works' }], showCategories: true };

describe('withComboNavLink', () => {
  beforeEach(() => vi.clearAllMocks());

  it('adds the link while a combo is published', async () => {
    mockGetPublishedCombos.mockResolvedValue([{ id: 'c1' }]);
    const result = await withComboNavLink(header);
    expect(result?.navLinks.map((l) => l.href)).toEqual(['/how-it-works', '/combos']);
  });

  it('works when the owner has not saved any header settings yet', async () => {
    mockGetPublishedCombos.mockResolvedValue([{ id: 'c1' }]);
    expect((await withComboNavLink(null))?.navLinks).toEqual([{ label: 'Combo offers', href: '/combos' }]);
  });

  it('changes nothing with no published combos, if the owner already linked it, or if the lookup fails', async () => {
    mockGetPublishedCombos.mockResolvedValue([]);
    expect(await withComboNavLink(header)).toBe(header);
    mockGetPublishedCombos.mockResolvedValue([{ id: 'c1' }]);
    const own = { navLinks: [{ label: 'Combos', href: '/combos' }] };
    expect(await withComboNavLink(own)).toBe(own);
    mockGetPublishedCombos.mockRejectedValue(new Error('down'));
    expect(await withComboNavLink(header)).toBe(header);
    expect(await withComboNavLink(null)).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AccountPage from './page';

const mockUser = { uid: 'user_1', phoneNumber: '+919876543210' };
const mockSignOut = vi.fn();
let mockAuthUser: typeof mockUser | null = mockUser;
vi.mock('../../../lib/auth-context', () => ({
  useAuth: vi.fn(() => ({ user: mockAuthUser, signOut: mockSignOut })),
}));

const mockGetDocs = vi.fn();
const mockGetDoc = vi.fn();
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
}));
vi.mock('../../../lib/firebase-client', () => ({ getFirebaseApp: vi.fn(() => ({})) }));

vi.mock('../../../lib/wishlist', () => ({
  getWishlistIds: vi.fn(() => ['w1', 'w2']),
  subscribeToWishlist: vi.fn(() => () => {}),
}));
vi.mock('../../../lib/recommendations', () => ({
  getWishlistBasedRecommendations: vi.fn().mockResolvedValue([]),
  getTrendingProducts: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../../components/product/RecentlyViewedRail', () => ({ RecentlyViewedRail: () => null }));
vi.mock('../../../components/account/PrivacyAndSecurity', () => ({ PrivacyAndSecurity: () => null }));

function makeSnapshot(docs: Array<Record<string, unknown>>) {
  return { docs: docs.map((data) => ({ data: () => data })) };
}

describe('AccountPage (dashboard)', () => {
  beforeEach(() => {
    mockAuthUser = mockUser;
    mockGetDocs.mockReset();
    mockGetDoc.mockReset();
  });

  it('shows counts, recent orders, and a pending-deliveries count', async () => {
    mockGetDocs
      .mockResolvedValueOnce(
        makeSnapshot([
          { id: 'o1', orderNo: 'BP-2026-00003', status: 'shipped', total: 50000 },
          { id: 'o2', orderNo: 'BP-2026-00002', status: 'delivered', total: 30000 },
          { id: 'o3', orderNo: 'BP-2026-00001', status: 'cancelled', total: 20000 },
        ])
      )
      .mockResolvedValueOnce(makeSnapshot([{ id: 'addr_1' }, { id: 'addr_2' }]));
    mockGetDoc.mockResolvedValueOnce({ data: () => ({ firstName: 'Karthik' }) });

    render(<AccountPage />);

    expect(await screen.findByText('Welcome back, Karthik')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // order count
    // wishlist count and address count are both 2 in this fixture
    expect(screen.getAllByText('2')).toHaveLength(2);
    expect(screen.getByText('BP-2026-00003')).toBeInTheDocument();

    // Only 'shipped' counts as pending-delivery among the three seeded
    // orders (delivered and cancelled don't).
    await waitFor(() => {
      const onTheWay = screen.getByText('On the way').previousElementSibling;
      expect(onTheWay?.textContent).toBe('1');
    });
  });

  it('falls back to "My account" when no first name is on file', async () => {
    mockGetDocs.mockResolvedValueOnce(makeSnapshot([])).mockResolvedValueOnce(makeSnapshot([]));
    mockGetDoc.mockResolvedValueOnce({ data: () => ({}) });

    render(<AccountPage />);

    expect(await screen.findByText('My account')).toBeInTheDocument();
  });

  it('shows a sign-in prompt when signed out', async () => {
    mockAuthUser = null;
    render(<AccountPage />);
    expect(screen.getByRole('heading', { name: /sign in to see your account/i })).toBeInTheDocument();
    expect(mockGetDocs).not.toHaveBeenCalled();
  });
});

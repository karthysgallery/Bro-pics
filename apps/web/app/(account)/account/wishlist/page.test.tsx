import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import WishlistPage from './page';

vi.mock('../../../../lib/wishlist', () => ({
  getWishlistIds: vi.fn(() => ['product_1']),
  subscribeToWishlist: vi.fn(() => () => {}),
}));

const mockGetDoc = vi.fn();
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
}));
vi.mock('../../../../lib/firebase-client', () => ({ getFirebaseApp: vi.fn(() => ({})) }));

describe('WishlistPage', () => {
  it('[FE-01] shows a retryable error instead of an infinite skeleton when the wishlist read fails', async () => {
    mockGetDoc.mockRejectedValueOnce(new Error('offline'));

    render(<WishlistPage />);

    expect(await screen.findByText('Could not load your wishlist')).toBeInTheDocument();
    expect(screen.getByText('Try again')).toBeInTheDocument();
  });

});

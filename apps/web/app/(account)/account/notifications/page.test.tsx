import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NotificationsPage from './page';

const mockUser = { uid: 'user_1', phoneNumber: '+919876543210', getIdToken: vi.fn().mockResolvedValue('id-token') };
vi.mock('../../../../lib/auth-context', () => ({
  useAuth: vi.fn(() => ({ user: mockUser, loading: false })),
}));

const mockGetDoc = vi.fn();
const mockSetDoc = vi.fn().mockResolvedValue(undefined);
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
}));
vi.mock('../../../../lib/firebase-client', () => ({ getFirebaseApp: vi.fn(() => ({})) }));

const mockRefreshNotifications = vi.fn().mockResolvedValue(undefined);
const mockMarkNotificationRead = vi.fn().mockResolvedValue(undefined);
let mockCachedNotifications: unknown[] = [];
vi.mock('../../../../lib/notifications', () => ({
  getNotifications: () => mockCachedNotifications,
  refreshNotifications: (...args: unknown[]) => mockRefreshNotifications(...args),
  markNotificationRead: (...args: unknown[]) => mockMarkNotificationRead(...args),
  subscribeToNotifications: vi.fn(() => () => {}),
}));

describe('NotificationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefreshNotifications.mockResolvedValue(undefined);
    mockSetDoc.mockResolvedValue(undefined);
    mockCachedNotifications = [];
    mockGetDoc.mockResolvedValue({ data: () => ({}) });
  });

  it('shows an empty state when there are no notifications', async () => {
    render(<NotificationsPage />);
    expect(await screen.findByText('No notifications yet')).toBeInTheDocument();
  });

  it('lists notifications and marks one read on click', async () => {
    mockCachedNotifications = [
      { id: 'n1', userId: 'user_1', category: 'order', title: 'Order shipped', body: 'It is on the way.', linkHref: null, isRead: false, createdAt: new Date().toISOString() },
    ];
    render(<NotificationsPage />);

    const row = await screen.findByText('Order shipped');
    fireEvent.click(row);
    expect(mockMarkNotificationRead).toHaveBeenCalledWith(mockUser, 'n1');
  });

  it('loads existing marketing preferences and toggles one off', async () => {
    mockGetDoc.mockResolvedValue({ data: () => ({ notificationPreferences: { priceDrop: true, offers: true, recommendations: true } }) });
    render(<NotificationsPage />);

    const priceDropToggle = await screen.findByLabelText('Price drops');
    expect(priceDropToggle).toBeChecked();

    fireEvent.click(priceDropToggle);

    await waitFor(() =>
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ notificationPreferences: { priceDrop: false, offers: true, recommendations: true } }),
        { merge: true }
      )
    );
  });

  it('defaults all marketing preferences to on when the user has none saved', async () => {
    render(<NotificationsPage />);
    expect(await screen.findByLabelText('Offers & coupons')).toBeChecked();
  });
});

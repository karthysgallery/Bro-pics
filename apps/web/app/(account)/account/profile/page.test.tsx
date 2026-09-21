import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProfilePage from './page';

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

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetDoc.mockResolvedValue(undefined);
  });

  it('loads and shows the existing profile fields', async () => {
    mockGetDoc.mockResolvedValueOnce({
      data: () => ({ firstName: 'Karthik', lastName: 'R', email: 'k@example.com', dob: '1990-05-14', gender: 'male' }),
    });
    render(<ProfilePage />);

    expect(await screen.findByDisplayValue('Karthik')).toBeInTheDocument();
    expect(screen.getByDisplayValue('R')).toBeInTheDocument();
    expect(screen.getByDisplayValue('k@example.com')).toBeInTheDocument();
  });

  it('falls back to splitting an existing displayName when firstName/lastName are absent', async () => {
    mockGetDoc.mockResolvedValueOnce({ data: () => ({ displayName: 'Karthik Ramesh' }) });
    render(<ProfilePage />);

    expect(await screen.findByDisplayValue('Karthik')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ramesh')).toBeInTheDocument();
  });

  it('shows a validation error and does not save when first name is cleared', async () => {
    mockGetDoc.mockResolvedValueOnce({ data: () => ({ firstName: 'Karthik' }) });
    render(<ProfilePage />);

    const firstNameInput = await screen.findByLabelText('First name');
    fireEvent.change(firstNameInput, { target: { value: '' } });
    fireEvent.click(screen.getByText('Save changes'));

    expect(await screen.findByText('First name is required.')).toBeInTheDocument();
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('saves the profile, combining first/last name into displayName', async () => {
    mockGetDoc.mockResolvedValueOnce({ data: () => ({ firstName: 'Karthik' }) });
    render(<ProfilePage />);

    await screen.findByDisplayValue('Karthik');
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Ramesh' } });
    fireEvent.click(screen.getByText('Save changes'));

    await waitFor(() =>
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ displayName: 'Karthik Ramesh', firstName: 'Karthik', lastName: 'Ramesh' }),
        { merge: true }
      )
    );
  });

  it('shows a "Verified" badge next to the read-only phone number', async () => {
    mockGetDoc.mockResolvedValueOnce({ data: () => ({}) });
    render(<ProfilePage />);
    await screen.findByLabelText('Phone number');
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });
});

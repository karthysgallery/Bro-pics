import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import AddressesPage from './page';

vi.mock('../../../../lib/auth-context', () => ({
  useAuth: vi.fn(() => ({ user: { uid: 'user_1' }, loading: false })),
}));

const mockGetDocs = vi.fn();
const mockDeleteDoc = vi.fn().mockResolvedValue(undefined);
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  collection: vi.fn(() => ({})),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../../lib/firebase-client', () => ({ getFirebaseApp: vi.fn(() => ({})) }));

function makeSnapshot(addresses: Array<Record<string, unknown>>) {
  return { docs: addresses.map((data) => ({ data: () => data })) };
}

describe('AddressesPage', () => {
  beforeEach(() => {
    mockGetDocs.mockReset();
    mockDeleteDoc.mockClear();
  });

  it('shows an empty state with no saved addresses', async () => {
    mockGetDocs.mockResolvedValueOnce(makeSnapshot([]));
    render(<AddressesPage />);
    expect(await screen.findByText('No saved addresses yet')).toBeInTheDocument();
  });

  it('shows a type badge for an address with a type set', async () => {
    mockGetDocs.mockResolvedValueOnce(
      makeSnapshot([
        { id: 'addr_1', label: 'Mom\'s place', line1: '12 MG Road', city: 'Chennai', state: 'TN', pincode: '600001', phone: '+91123', line2: null, isDefault: true, type: 'home' },
      ])
    );
    render(<AddressesPage />);
    expect(await screen.findByText('Home')).toBeInTheDocument();
  });

  it('requires confirmation before deleting an address', async () => {
    mockGetDocs.mockResolvedValueOnce(
      makeSnapshot([
        { id: 'addr_1', label: 'Home', line1: '12 MG Road', city: 'Chennai', state: 'TN', pincode: '600001', phone: '+91123', line2: null, isDefault: true },
      ])
    );
    render(<AddressesPage />);

    fireEvent.click(await screen.findByText('Delete'));
    expect(mockDeleteDoc).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Delete this address?')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(mockDeleteDoc).toHaveBeenCalled());
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddressPicker } from './AddressPicker';

const mockGetDocs = vi.fn();
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  collection: vi.fn(() => ({})),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
}));
vi.mock('../../lib/firebase-client', () => ({ getFirebaseApp: vi.fn(() => ({})) }));

function makeSnapshot(addresses: Array<Record<string, unknown>>) {
  return { docs: addresses.map((data) => ({ data: () => data })) };
}

describe('AddressPicker', () => {
  it('shows saved addresses with the default one pre-selected', async () => {
    mockGetDocs.mockResolvedValueOnce(
      makeSnapshot([
        { id: 'addr_1', label: 'Home', line1: '12 MG Road', city: 'Chennai', state: 'TN', pincode: '600001', phone: '+91123', line2: null, isDefault: false },
        { id: 'addr_2', label: 'Work', line1: '5 Anna Salai', city: 'Chennai', state: 'TN', pincode: '600002', phone: '+91124', line2: null, isDefault: true },
      ])
    );
    const onSelect = vi.fn();
    render(<AddressPicker userId="user_1" onSelect={onSelect} />);

    expect(await screen.findByText(/Work/)).toBeInTheDocument();
    expect(onSelect).toHaveBeenCalledWith('addr_2');
  });

  it('shows the "add new address" form when no saved addresses exist', async () => {
    mockGetDocs.mockResolvedValueOnce(makeSnapshot([]));
    render(<AddressPicker userId="user_1" onSelect={vi.fn()} />);
    expect(await screen.findByText('Save address')).toBeInTheDocument();
  });

  it('calls onSelect when a different saved address is chosen', async () => {
    mockGetDocs.mockResolvedValueOnce(
      makeSnapshot([
        { id: 'addr_1', label: 'Home', line1: '12 MG Road', city: 'Chennai', state: 'TN', pincode: '600001', phone: '+91123', line2: null, isDefault: true },
        { id: 'addr_2', label: 'Work', line1: '5 Anna Salai', city: 'Chennai', state: 'TN', pincode: '600002', phone: '+91124', line2: null, isDefault: false },
      ])
    );
    const onSelect = vi.fn();
    render(<AddressPicker userId="user_1" onSelect={onSelect} />);
    fireEvent.click(await screen.findByLabelText(/Work/));
    expect(onSelect).toHaveBeenLastCalledWith('addr_2');
  });
});

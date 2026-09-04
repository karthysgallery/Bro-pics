import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddressForm } from './AddressForm';

const mockSetDoc = vi.fn().mockResolvedValue(undefined);
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn((_db, ...segments: string[]) => ({ path: segments.join('/') })),
  collection: vi.fn(() => ({})),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
}));
vi.mock('../../lib/firebase-client', () => ({ getFirebaseApp: vi.fn(() => ({})) }));

describe('AddressForm', () => {
  beforeEach(() => mockSetDoc.mockClear());

  it('saves a filled-in address and calls onSaved', async () => {
    const onSaved = vi.fn();
    render(<AddressForm userId="user_1" onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText('Address line 1'), { target: { value: '12 MG Road' } });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Chennai' } });
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'Tamil Nadu' } });
    fireEvent.change(screen.getByLabelText('Pincode'), { target: { value: '600001' } });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+919876543210' } });
    fireEvent.click(screen.getByText('Save address'));

    await waitFor(() => expect(mockSetDoc).toHaveBeenCalled());
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ line1: '12 MG Road', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' })
    );
  });

  it('does not submit when a required field is empty', async () => {
    const onSaved = vi.fn();
    render(<AddressForm userId="user_1" onSaved={onSaved} />);
    fireEvent.click(screen.getByText('Save address'));
    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });
});

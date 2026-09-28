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

  it("[FE-35] rejects a pincode starting with 9 (reserved for army postal service, never a real deliverable address)", async () => {
    const onSaved = vi.fn();
    render(<AddressForm userId="user_1" onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText('Address line 1'), { target: { value: '12 MG Road' } });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Chennai' } });
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'Tamil Nadu' } });
    fireEvent.change(screen.getByLabelText('Pincode'), { target: { value: '900001' } });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+919876543210' } });
    fireEvent.click(screen.getByText('Save address'));

    expect(await screen.findByText('Enter a valid 6-digit pincode.')).toBeInTheDocument();
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('[FE-35] makes the first address a customer ever saves the default automatically', async () => {
    const onSaved = vi.fn();
    render(<AddressForm userId="user_1" onSaved={onSaved} isFirstAddress />);
    fireEvent.change(screen.getByLabelText('Address line 1'), { target: { value: '12 MG Road' } });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Chennai' } });
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'Tamil Nadu' } });
    fireEvent.change(screen.getByLabelText('Pincode'), { target: { value: '600001' } });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+919876543210' } });
    fireEvent.click(screen.getByText('Save address'));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ isDefault: true })));
  });

  it('[FE-35] does not make a second address default just because isFirstAddress was passed by mistake for an edit', async () => {
    const existingAddress = {
      id: 'addr_1', label: null, line1: '12 MG Road', line2: null, city: 'Chennai', state: 'Tamil Nadu',
      pincode: '600001', phone: '+919876543210', isDefault: false, type: null, country: 'India', deliveryInstructions: null,
    };
    const onSaved = vi.fn();
    render(<AddressForm userId="user_1" onSaved={onSaved} existingAddress={existingAddress} isFirstAddress />);
    fireEvent.click(screen.getByText('Save address'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ isDefault: false })));
  });
});

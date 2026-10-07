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

    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Priya Iyer' } });
    fireEvent.change(screen.getByLabelText('Address line 1'), { target: { value: '12 MG Road' } });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Chennai' } });
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'Tamil Nadu' } });
    fireEvent.change(screen.getByLabelText('Pincode'), { target: { value: '600001' } });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+919876543210' } });
    fireEvent.click(screen.getByText('Save address'));

    await waitFor(() => expect(mockSetDoc).toHaveBeenCalled());
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ recipientName: 'Priya Iyer', line1: '12 MG Road', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' })
    );
  });

  it('asks for the name of the person receiving the parcel', async () => {
    const onSaved = vi.fn();
    render(<AddressForm userId="user_1" onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText('Address line 1'), { target: { value: '12 MG Road' } });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Chennai' } });
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'Tamil Nadu' } });
    fireEvent.change(screen.getByLabelText('Pincode'), { target: { value: '600001' } });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+919876543210' } });
    fireEvent.click(screen.getByText('Save address'));
    expect(await screen.findByText('Enter the name of the person receiving the parcel.')).toBeInTheDocument();
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("starts the name with the account holder's name, which can be changed for a gift", async () => {
    const { AuthContext } = await import('../../lib/auth-context');
    render(
      <AuthContext.Provider value={{ user: { uid: 'user_1', displayName: 'Karthik' } as never, loading: false, signOut: vi.fn() }}>
        <AddressForm userId="user_1" onSaved={vi.fn()} />
      </AuthContext.Provider>
    );
    expect(screen.getByLabelText('Full name')).toHaveValue('Karthik');
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
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Priya Iyer' } });
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
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Priya Iyer' } });
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
      id: 'addr_1', recipientName: 'Priya Iyer', label: null, line1: '12 MG Road', line2: null, city: 'Chennai', state: 'Tamil Nadu',
      pincode: '600001', phone: '+919876543210', isDefault: false, type: null, country: 'India', deliveryInstructions: null,
    };
    const onSaved = vi.fn();
    render(<AddressForm userId="user_1" onSaved={onSaved} existingAddress={existingAddress} isFirstAddress />);
    fireEvent.click(screen.getByText('Save address'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ isDefault: false })));
  });

  function fillValid(overrides: Partial<Record<'Full name' | 'Address line 1' | 'City' | 'State' | 'Pincode' | 'Phone', string>> = {}) {
    const values = { 'Full name': 'Priya Iyer', 'Address line 1': '12 MG Road', City: 'Chennai', State: 'Tamil Nadu', Pincode: '600001', Phone: '98765 43210', ...overrides };
    for (const [label, value] of Object.entries(values)) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
  }

  describe('validation and submission behaviour', () => {
    it('tells the customer which fields are missing, one message per field, instead of a single generic line', async () => {
      render(<AddressForm userId="user_1" onSaved={vi.fn()} />);
      fireEvent.click(screen.getByText('Save address'));

      expect(await screen.findByText('Enter your house/flat number and street.')).toBeInTheDocument();
      expect(screen.getByText('Enter your city or town.')).toBeInTheDocument();
      expect(screen.getByText('Choose your state.')).toBeInTheDocument();
      expect(screen.getByText('Enter a valid 6-digit pincode.')).toBeInTheDocument();
      expect(screen.getByText('Enter a valid 10-digit mobile number.')).toBeInTheDocument();
      expect(screen.getByLabelText('City')).toHaveAttribute('aria-invalid', 'true');
      expect(mockSetDoc).not.toHaveBeenCalled();
    });

    it('rejects a phone number that is not a valid Indian mobile', async () => {
      render(<AddressForm userId="user_1" onSaved={vi.fn()} />);
      fillValid({ Phone: '12345' });
      fireEvent.click(screen.getByText('Save address'));
      expect(await screen.findByText('Enter a valid 10-digit mobile number.')).toBeInTheDocument();
      expect(mockSetDoc).not.toHaveBeenCalled();
    });

    it('normalises an accepted phone to +91XXXXXXXXXX however it was typed', async () => {
      const onSaved = vi.fn();
      render(<AddressForm userId="user_1" onSaved={onSaved} />);
      fillValid({ Phone: '098765 43210' });
      fireEvent.click(screen.getByText('Save address'));
      await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ phone: '+919876543210' })));
    });

    it('offers states as a list (not free text) and keeps an unlisted legacy value selectable', () => {
      const legacy = {
        id: 'a1', label: null, line1: '1 Road', line2: null, city: 'Chennai', state: 'TN', pincode: '600001',
        phone: '+919876543210', isDefault: false, type: null, country: 'India', deliveryInstructions: null,
      };
      render(<AddressForm userId="user_1" onSaved={vi.fn()} existingAddress={legacy} />);
      const select = screen.getByLabelText('State') as HTMLSelectElement;
      expect(select.tagName).toBe('SELECT');
      expect(select.value).toBe('TN');
      expect(Array.from(select.options).some((o) => o.value === 'Tamil Nadu')).toBe(true);
    });

    it('gives mobile keyboards the right hints (numeric pincode, tel phone)', () => {
      render(<AddressForm userId="user_1" onSaved={vi.fn()} />);
      expect(screen.getByLabelText('Pincode')).toHaveAttribute('inputmode', 'numeric');
      expect(screen.getByLabelText('Phone')).toHaveAttribute('type', 'tel');
    });

    it('does not create duplicate addresses on a double-click: the button is disabled while saving', async () => {
      let resolveSave: () => void = () => {};
      mockSetDoc.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveSave = resolve; }));
      const onSaved = vi.fn();
      render(<AddressForm userId="user_1" onSaved={onSaved} />);
      fillValid();

      fireEvent.click(screen.getByText('Save address'));
      fireEvent.click(await screen.findByText('Saving…'));
      fireEvent.click(screen.getByText('Saving…'));
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Saving…')).toBeDisabled();

      resolveSave();
      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    });

    it('shows an error and re-enables the button when saving fails, rather than failing silently', async () => {
      mockSetDoc.mockRejectedValueOnce(new Error('offline'));
      const onSaved = vi.fn();
      render(<AddressForm userId="user_1" onSaved={onSaved} />);
      fillValid();
      fireEvent.click(screen.getByText('Save address'));

      expect(await screen.findByText(/couldn't save this address/i)).toBeInTheDocument();
      expect(onSaved).not.toHaveBeenCalled();
      expect(screen.getByText('Save address')).not.toBeDisabled();
    });
  });
});

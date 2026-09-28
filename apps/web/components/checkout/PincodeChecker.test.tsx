import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PincodeChecker } from './PincodeChecker';

describe('PincodeChecker', () => {
  it('[FE-33] checks a manually entered pincode and shows the delivery estimate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ serviceable: true, zone: 'metro', estimatedDaysMin: 2, estimatedDaysMax: 4 }),
      })
    );
    render(<PincodeChecker />);
    fireEvent.change(screen.getByLabelText('Pincode'), { target: { value: '110001' } });
    fireEvent.click(screen.getByText('Check'));
    await waitFor(() => expect(screen.getByText(/Delivers in 2-4 days/)).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith('/api/delivery-estimate?pincode=110001');
  });

  it('[FE-33] shows the zone label for a non-metro pincode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ serviceable: true, zone: 'remote', estimatedDaysMin: 7, estimatedDaysMax: 12 }),
      })
    );
    render(<PincodeChecker />);
    fireEvent.change(screen.getByLabelText('Pincode'), { target: { value: '744101' } });
    fireEvent.click(screen.getByText('Check'));
    await waitFor(() => expect(screen.getByText(/remote pincode/)).toBeInTheDocument());
  });

  it('[FE-33] shows an error message for an invalid pincode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ serviceable: false, error: 'Invalid pincode' }),
      })
    );
    render(<PincodeChecker />);
    fireEvent.change(screen.getByLabelText('Pincode'), { target: { value: '000000' } });
    fireEvent.click(screen.getByText('Check'));
    await waitFor(() => expect(screen.getByText('Invalid pincode')).toBeInTheDocument());
  });

  it('[FE-33] auto-checks the initial pincode when autoCheck is set, without a click', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ serviceable: true, zone: 'standard', estimatedDaysMin: 4, estimatedDaysMax: 7 }),
      })
    );
    render(<PincodeChecker initialPincode="600001" autoCheck />);
    await waitFor(() => expect(screen.getByText(/Delivers in 4-7 days/)).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith('/api/delivery-estimate?pincode=600001');
  });

  it('[FE-33] does not auto-check without autoCheck, even with an initial pincode', () => {
    vi.stubGlobal('fetch', vi.fn());
    render(<PincodeChecker initialPincode="600001" />);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

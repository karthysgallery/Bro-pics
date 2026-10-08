import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DEFAULT_APPEARANCE } from '@bro-pics/shared';

const api = vi.hoisted(() => vi.fn());
vi.mock('../../../components/admin/template-builder/use-admin-api', () => ({ useAdminApi: () => api }));
vi.mock('../../../components/admin/MediaPickerModal', () => ({
  MediaPickerModal: ({ isOpen, onSelect }: { isOpen: boolean; onSelect: (a: { id: string }) => void }) =>
    isOpen ? <button onClick={() => onSelect({ id: 'media_icon' })}>pick media</button> : null,
}));

import AppearancePage from './page';

const putBody = () => JSON.parse(String(api.mock.calls.find(([, init]) => init?.method === 'PUT')![1].body));

describe('admin appearance', () => {
  beforeEach(() => {
    api.mockReset();
    api.mockImplementation(async (_path: string, init?: RequestInit) => (init?.method === 'PUT' ? { key: 'appearance', value: JSON.parse(String(init.body)) } : { key: 'appearance', value: null }));
  });

  it('starts as the original look with nothing to save', async () => {
    render(<AppearancePage />);
    expect(await screen.findByRole('heading', { name: 'Appearance' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Reset to original look' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Headings and prices') as HTMLSelectElement).value).toBe('outfit');
  });

  it('saves a new heading font, round corners, a square button, a favicon and a hidden section', async () => {
    render(<AppearancePage />);
    fireEvent.change(await screen.findByLabelText('Headings and prices'), { target: { value: 'playfair' } });
    fireEvent.click(screen.getByLabelText('Very round'));
    fireEvent.click(screen.getByLabelText(/Square/));
    fireEvent.click(screen.getByLabelText(/Customer reviews/));
    fireEvent.click(screen.getByRole('button', { name: 'Choose image' }));
    fireEvent.click(screen.getByText('pick media'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText(/Saved\./)).toBeTruthy());
    expect(api.mock.calls.find(([, init]) => init?.method === 'PUT')![0]).toBe('/api/admin/settings/appearance');
    expect(putBody()).toMatchObject({ displayFont: 'playfair', bodyFont: 'manrope', corners: 'round', buttons: 'square', faviconMediaId: 'media_icon' });
    expect(putBody().productPage).toMatchObject({ showReviews: false, showRelated: true });
  });

  it('resets everything to the original look', async () => {
    api.mockImplementation(async () => ({ key: 'appearance', value: { ...DEFAULT_APPEARANCE, corners: 'sharp', buttons: 'pill' } }));
    render(<AppearancePage />);
    const reset = await screen.findByRole('button', { name: 'Reset to original look' });
    await waitFor(() => expect((reset as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(reset);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(putBody()).toEqual(DEFAULT_APPEARANCE));
  });
});

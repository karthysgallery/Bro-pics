import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => vi.fn());
vi.mock('../../../components/admin/template-builder/use-admin-api', () => ({ useAdminApi: () => api }));
vi.mock('../../../components/admin/MediaPickerModal', () => ({ MediaPickerModal: () => null }));

import HeaderFooterPage from './page';

describe('admin header & footer', () => {
  beforeEach(() => {
    api.mockReset();
    api.mockImplementation(async (_path: string, init?: RequestInit) => (init?.method === 'PUT' ? {} : { value: null }));
  });

  it('starts from what the shop shows today, then saves edits to both documents', async () => {
    render(<HeaderFooterPage />);
    expect(await screen.findByDisplayValue('Best sellers')).toBeTruthy();
    expect(screen.getByDisplayValue('About us')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Add menu link' }));
    fireEvent.change(screen.getByLabelText('Menu link 3 name'), { target: { value: 'Diwali gifts' } });
    fireEvent.change(screen.getByLabelText('Menu link 3 address'), { target: { value: '/category/diwali' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /main category/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));

    await waitFor(() => expect(screen.getByText(/header and footer are updated/)).toBeTruthy());
    const header = JSON.parse(String(api.mock.calls.find(([p, i]) => p === '/api/admin/settings/header' && i?.method === 'PUT')![1].body));
    expect(header).toEqual({
      navLinks: [
        { label: 'Best sellers', href: '/#best-sellers' },
        { label: 'How it works', href: '/how-it-works' },
        { label: 'Diwali gifts', href: '/category/diwali' },
      ],
      showCategories: false,
      logoMediaId: null,
    });
    const footer = JSON.parse(String(api.mock.calls.find(([p, i]) => p === '/api/admin/settings/footer' && i?.method === 'PUT')![1].body));
    expect(footer.columns[0].links[0]).toEqual({ label: 'About us', href: '/about' });
  });

  it('refuses links that would not work', async () => {
    render(<HeaderFooterPage />);
    fireEvent.change(await screen.findByDisplayValue('Best sellers'), { target: { value: 'Sale' } });
    fireEvent.change(screen.getByLabelText('Menu link 1 address'), { target: { value: 'sale' } });
    expect(screen.getByText(/needs a link starting with/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save & publish' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

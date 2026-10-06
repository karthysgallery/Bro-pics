import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => vi.fn());
vi.mock('../../../components/admin/template-builder/use-admin-api', () => ({ useAdminApi: () => api }));

import SiteTextPage from './page';

describe('admin site text', () => {
  beforeEach(() => {
    api.mockReset();
    api.mockImplementation(async (_p: string, init?: RequestInit) => (init?.method === 'PUT' ? {} : { value: { trust4: 'Love it or we remake it' } }));
  });

  it('shows the original wording as placeholders and saves only real changes', async () => {
    render(<SiteTextPage />);
    expect(await screen.findByDisplayValue('Love it or we remake it')).toBeTruthy();
    const trust1 = screen.getByLabelText('Badge 1 (print quality)') as HTMLInputElement;
    expect(trust1.placeholder).toBe('Archival-quality prints');
    fireEvent.change(trust1, { target: { value: 'Museum-grade prints' } });
    // Typing the original wording back counts as "keep the original".
    fireEvent.change(screen.getByLabelText('Badge 2 (craft)'), { target: { value: 'Handcrafted in India' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
    await waitFor(() => expect(screen.getByText(/new wording now/)).toBeTruthy());
    const put = api.mock.calls.find(([, i]) => i?.method === 'PUT')!;
    expect(put[0]).toBe('/api/admin/settings/siteText');
    expect(JSON.parse(String(put[1].body))).toEqual({ trust1: 'Museum-grade prints', trust4: 'Love it or we remake it' });
  });
});

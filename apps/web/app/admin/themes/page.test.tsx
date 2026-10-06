import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { defaultThemeSettings } from '@bro-pics/shared';

const api = vi.hoisted(() => vi.fn());
vi.mock('../../../components/admin/template-builder/use-admin-api', () => ({ useAdminApi: () => api }));

import ThemesPage from './page';

describe('admin festival themes', () => {
  beforeEach(() => {
    api.mockReset();
    api.mockImplementation(async (_path: string, init?: RequestInit) => (init?.method === 'PUT' ? { key: 'theme', value: JSON.parse(String(init.body)) } : { key: 'theme', value: null }));
  });

  it('starts from the built-in festivals before anything is saved', async () => {
    render(<ThemesPage />);
    for (const name of ['Everyday', 'Diwali', 'Pongal', 'Christmas', 'New Year']) {
      expect(await screen.findByRole('heading', { name })).toBeTruthy();
    }
    expect(screen.getByText('Live on the shop:').parentElement?.textContent).toMatch(/Everyday/);
  });

  it('turns a festival on now and saves it', async () => {
    render(<ThemesPage />);
    const diwali = (await screen.findByRole('heading', { name: 'Diwali' })).closest('article')!;
    fireEvent.click(within(diwali).getByRole('button', { name: 'Turn on now' }));
    expect(screen.getByText(/shop will show Diwali/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
    await waitFor(() => expect(screen.getByText(/now shows the Diwali theme/)).toBeTruthy());
    const put = api.mock.calls.find(([, init]) => init?.method === 'PUT')!;
    expect(put[0]).toBe('/api/admin/settings/theme');
    expect(JSON.parse(String(put[1].body))).toMatchObject({ mode: 'manual', activeThemeId: 'diwali' });
  });

  it('schedules a festival by dates', async () => {
    render(<ThemesPage />);
    fireEvent.change(await screen.findByLabelText('Christmas start date'), { target: { value: '2026-12-20' } });
    fireEvent.change(screen.getByLabelText('Christmas end date'), { target: { value: '2026-12-26' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
    await waitFor(() => expect(api.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true));
    const body = JSON.parse(String(api.mock.calls.find(([, init]) => init?.method === 'PUT')![1].body));
    expect(body.themes.find((t: { id: string }) => t.id === 'christmas').schedule).toEqual({ start: '2026-12-20', end: '2026-12-26' });
  });

  it('warns when edited colours make text hard to read, and adds a custom theme', async () => {
    render(<ThemesPage />);
    const pongal = (await screen.findByRole('heading', { name: 'Pongal' })).closest('article')!;
    fireEvent.click(within(pongal).getByRole('button', { name: 'Edit look' }));
    expect(screen.getByText(/All text stays easy to read/)).toBeTruthy();
    const goldPicker = screen.getByText('Main buttons').closest('label')!.querySelector('input')!;
    fireEvent.change(goldPicker, { target: { value: '#111111' } });
    expect(screen.getByRole('alert').textContent).toMatch(/main buttons is hard to read/);

    fireEvent.click(screen.getByRole('button', { name: 'Add your own theme' }));
    expect(screen.getByRole('heading', { name: 'Pongal copy' })).toBeTruthy();
  });

  it('loads saved settings from the server', async () => {
    const saved = { ...defaultThemeSettings(), mode: 'manual' as const, activeThemeId: 'christmas' };
    api.mockResolvedValueOnce({ key: 'theme', value: saved });
    render(<ThemesPage />);
    await waitFor(() => expect(screen.getByText('Live on the shop:').parentElement?.textContent).toMatch(/Christmas/));
  });
});

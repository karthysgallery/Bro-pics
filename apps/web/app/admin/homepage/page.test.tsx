import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => vi.fn());
vi.mock('../../../components/admin/template-builder/use-admin-api', () => ({ useAdminApi: () => api }));
vi.mock('../../../components/admin/MediaPickerModal', () => ({ MediaPickerModal: () => null }));

import HomepageAdmin from './page';

const base = { subtitle: '', image: '', mobileImage: '', link: '', startsAt: null, endsAt: null, config: {} };
const sections = [
  { ...base, id: 'h1', type: 'hero_slider', title: 'Main banner', sortOrder: 0, isActive: true, heroSlides: [{ id: 's1', title: 'Frames built to last', image: '/a.jpg', mobileImage: '/a.jpg', sortOrder: 0 }] },
  { ...base, id: 'w1', type: 'how_it_works', title: 'How it works', sortOrder: 1, isActive: true, steps: [{ label: 'Upload', desc: 'Pick a photo' }] },
  { ...base, id: 'o1', type: 'offer_strip', title: 'Diwali offer', sortOrder: 2, isActive: false },
];

describe('admin homepage', () => {
  beforeEach(() => {
    api.mockReset();
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/api/admin/homepage-sections' && !init) return { sections };
      if (path === '/api/admin/categories') return { categories: [] };
      if (init?.method === 'POST' && path === '/api/admin/homepage-sections') return { section: { ...base, id: 'n1', ...JSON.parse(String(init.body)), sortOrder: 3 } };
      return {};
    });
  });

  it('lists sections by their real names, in order, with show/hide', async () => {
    render(<HomepageAdmin />);
    expect(await screen.findByText('Hero banner')).toBeTruthy();
    expect(screen.getByText('How it works')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Show' })[0]);
    await waitFor(() => expect(api).toHaveBeenCalledWith('/api/admin/homepage-sections/o1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ isActive: true }) })));
  });

  it('edits the "How it works" steps and saves them', async () => {
    render(<HomepageAdmin />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Edit' }))[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
    fireEvent.change(screen.getByLabelText('Step 2 name'), { target: { value: 'We frame it' } });
    fireEvent.change(screen.getByLabelText('Step 2 description'), { target: { value: 'By hand, in India' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }));
    await waitFor(() => expect(screen.getByText(/How it works saved/)).toBeTruthy());
    const patch = api.mock.calls.find(([p, i]) => p === '/api/admin/homepage-sections/w1' && i?.method === 'PATCH')!;
    expect(JSON.parse(String(patch[1].body)).steps).toEqual([
      { label: 'Upload', desc: 'Pick a photo' },
      { label: 'We frame it', desc: 'By hand, in India' },
    ]);
  });

  it('will not save a hero slide without a headline or with an unsafe link', async () => {
    render(<HomepageAdmin />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Edit' }))[0]);
    fireEvent.change(screen.getByLabelText('Slide 1 headline'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Slide 1 button link'), { target: { value: 'javascript:alert(1)' } });
    expect(screen.getByRole('alert').textContent).toMatch(/Slide 1 needs a headline/);
    expect(screen.getByRole('alert').textContent).toMatch(/button link must start/);
    expect((screen.getByRole('button', { name: 'Save & publish' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('adds a new section, hidden until shown', async () => {
    render(<HomepageAdmin />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add section' }));
    fireEvent.click(screen.getByRole('button', { name: /Why choose us/ }));
    await waitFor(() => expect(screen.getByText(/Why choose us added/)).toBeTruthy());
    const post = api.mock.calls.find(([p, i]) => p === '/api/admin/homepage-sections' && i?.method === 'POST')!;
    expect(JSON.parse(String(post[1].body))).toMatchObject({ type: 'why_us', isActive: false });
  });
});

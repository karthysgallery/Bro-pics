import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { detectPhotoSlots, templateDraftFromDetection, type PersonalizationTemplate } from '@bro-pics/shared';

const api = vi.hoisted(() => vi.fn());
vi.mock('../../../components/admin/template-builder/use-admin-api', () => ({ useAdminApi: () => api }));
vi.mock('../../../components/admin/MediaPickerModal', () => ({ MediaPickerModal: () => null }));
const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import ListPage from './page';
import BuilderPage from './[id]/page';

function draft(status: PersonalizationTemplate['status'] = 'draft'): PersonalizationTemplate {
  const w = 300;
  const h = 200;
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (const x0 of [20, 160]) for (let y = 20; y < 180; y++) for (let x = x0; x < x0 + 120; x++) data.fill(180, (y * w + x) * 4, (y * w + x) * 4 + 3);
  const t = templateDraftFromDetection({ id: 'two-up-abcd', name: 'Two up', artwork: { assetId: 'media_1' }, canvas: { width: 3600, height: 2400 }, detection: detectPhotoSlots({ width: w, height: h, data }) });
  return { ...t, status };
}

describe('admin collage templates pages', () => {
  beforeEach(() => {
    api.mockReset();
    push.mockReset();
  });

  it('lists templates with their live state, and opens the new-from-image form', async () => {
    api.mockImplementation(async (path: string) => {
      if (path === '/api/admin/personalization-templates') {
        return { templates: [{ id: 't1', name: 'Forever & Always', type: 'collage', latestVersion: 2, latestStatus: 'draft', publishedVersion: 1, updatedAt: '' }] };
      }
      if (path === '/api/admin/products') return { products: [] };
      return {};
    });
    render(<ListPage />);
    expect(await screen.findByText('Forever & Always')).toBeTruthy();
    expect(screen.getByText(/live: v1/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'New collage from image' }));
    expect(screen.getByText('New collage from an image')).toBeTruthy();
    // Nothing can be detected until a name and an image are chosen.
    expect((screen.getByRole('button', { name: 'Find photo spaces' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('loads a draft, edits it and saves it', async () => {
    const t = draft();
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === `/api/admin/personalization-templates/${t.id}`) return { versions: [t] };
      if (path === '/api/admin/products') return { products: [] };
      if (init?.method === 'PUT') return JSON.parse(String(init.body));
      return {};
    });
    render(<BuilderPage params={Promise.resolve({ id: t.id })} />);
    expect(await screen.findByDisplayValue('Two up')).toBeTruthy();
    expect(screen.getByText(/2 photo spaces/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Add photo space' }));
    expect(screen.getByText(/3 photo spaces/)).toBeTruthy();
    expect(screen.getByText('Photo space 3')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(screen.getByText('Draft saved.')).toBeTruthy());
    const put = api.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(put?.[0]).toBe(`/api/admin/personalization-templates/${t.id}/versions/1`);
    expect(JSON.parse(String(put?.[1]?.body)).photoSlots).toHaveLength(3);
  });

  it('keeps a published version read-only and offers a new version instead', async () => {
    const t = draft('published');
    api.mockImplementation(async (path: string) => {
      if (path === `/api/admin/personalization-templates/${t.id}`) return { versions: [t] };
      if (path === '/api/admin/products') return { products: [] };
      return {};
    });
    render(<BuilderPage params={Promise.resolve({ id: t.id })} />);
    expect(await screen.findByRole('button', { name: 'Edit as a new version' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add photo space' })).toBeNull();
    expect(screen.getByText(/This version is live/)).toBeTruthy();
  });
});

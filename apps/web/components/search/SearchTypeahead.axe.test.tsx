import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import { SearchTypeahead } from './SearchTypeahead';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
}));

describe('[FE-44] SearchTypeahead accessibility', () => {
  it('has no axe violations with suggestions open', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        products: [{ id: 'p1', title: 'Classic Wooden Frame', slug: 'classic-wooden-frame' }],
        categories: [{ id: 'c1', name: 'Wooden Frames', slug: 'wooden-frames' }],
        popularSearches: [],
      }),
    }) as unknown as typeof fetch;

    const { container } = render(<SearchTypeahead />);
    fireEvent.change(screen.getByPlaceholderText('Search for frames, gifts and more...'), { target: { value: 'wood' } });
    await waitFor(() => expect(screen.getByText('Classic Wooden Frame')).toBeInTheDocument());

    expect(await axe(container)).toHaveNoViolations();
  });
});

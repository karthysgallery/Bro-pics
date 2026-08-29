import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SearchTypeahead } from './SearchTypeahead';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

describe('SearchTypeahead', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          products: [{ id: 'p1', title: 'Classic Wooden Frame', slug: 'classic-wooden-frame' }],
        }),
      })
    );
    localStorage.clear();
  });

  it('shows recent searches from localStorage when the input is focused and empty', () => {
    localStorage.setItem('bropics_recent_searches', JSON.stringify(['photo frame']));
    render(<SearchTypeahead />);
    fireEvent.focus(screen.getByPlaceholderText('Search products...'));
    expect(screen.getByText('photo frame')).toBeInTheDocument();
  });

  it('fetches and displays suggestions after typing', async () => {
    render(<SearchTypeahead />);
    fireEvent.change(screen.getByPlaceholderText('Search products...'), { target: { value: 'classic' } });
    await waitFor(() => expect(screen.getByText('Classic Wooden Frame')).toBeInTheDocument(), { timeout: 1000 });
  });

  it('saves the query to recent searches on submit', () => {
    render(<SearchTypeahead />);
    const input = screen.getByPlaceholderText('Search products...');
    fireEvent.change(input, { target: { value: 'mug' } });
    fireEvent.submit(input.closest('form')!);
    const stored = JSON.parse(localStorage.getItem('bropics_recent_searches') ?? '[]');
    expect(stored).toContain('mug');
  });
});

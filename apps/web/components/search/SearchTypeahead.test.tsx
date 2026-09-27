import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SearchTypeahead } from './SearchTypeahead';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
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
    fireEvent.focus(screen.getByPlaceholderText('Search for frames, gifts and more...'));
    expect(screen.getByText('photo frame')).toBeInTheDocument();
  });

  it('fetches and displays suggestions after typing', async () => {
    render(<SearchTypeahead />);
    fireEvent.change(screen.getByPlaceholderText('Search for frames, gifts and more...'), { target: { value: 'classic' } });
    await waitFor(() => expect(screen.getByText('Classic Wooden Frame')).toBeInTheDocument(), { timeout: 1000 });
  });

  it('saves the query to recent searches on submit', () => {
    render(<SearchTypeahead />);
    const input = screen.getByPlaceholderText('Search for frames, gifts and more...');
    fireEvent.change(input, { target: { value: 'mug' } });
    fireEvent.submit(input.closest('form')!);
    const stored = JSON.parse(localStorage.getItem('bropics_recent_searches') ?? '[]');
    expect(stored).toContain('mug');
  });

  it('navigates suggestions with the keyboard and selects one with Enter', async () => {
    render(<SearchTypeahead />);
    const input = screen.getByPlaceholderText('Search for frames, gifts and more...');
    fireEvent.change(input, { target: { value: 'classic' } });
    await waitFor(() => expect(screen.getByText('Classic Wooden Frame')).toBeInTheDocument(), { timeout: 1000 });

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const option = screen.getByRole('option', { name: 'Classic Wooden Frame' });
    expect(option).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', option.id);
  });

  it('closes the suggestion list on Escape', async () => {
    render(<SearchTypeahead />);
    const input = screen.getByPlaceholderText('Search for frames, gifts and more...');
    fireEvent.change(input, { target: { value: 'classic' } });
    await waitFor(() => expect(screen.getByText('Classic Wooden Frame')).toBeInTheDocument(), { timeout: 1000 });

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByText('Classic Wooden Frame')).not.toBeInTheDocument();
  });

  it('[FE-31] shows popular searches on focus when there are no recent searches yet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ products: [], categories: [], popularSearches: ['birthday frame', 'wedding gift'] }),
      })
    );
    render(<SearchTypeahead />);
    fireEvent.focus(screen.getByPlaceholderText('Search for frames, gifts and more...'));
    await waitFor(() => expect(screen.getByText('birthday frame')).toBeInTheDocument());
    expect(screen.getByText('Popular searches')).toBeInTheDocument();
  });

  it('[FE-31] prefers recent searches over popular searches when both exist', async () => {
    localStorage.setItem('bropics_recent_searches', JSON.stringify(['photo frame']));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ products: [], categories: [], popularSearches: ['birthday frame'] }),
      })
    );
    render(<SearchTypeahead />);
    fireEvent.focus(screen.getByPlaceholderText('Search for frames, gifts and more...'));
    await waitFor(() => expect(screen.getByText('photo frame')).toBeInTheDocument());
    expect(screen.queryByText('Popular searches')).not.toBeInTheDocument();
  });

  it('[FE-31] shows a category suggestion with a thumbnail alongside product suggestions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          products: [{ id: 'p1', title: 'Classic Wooden Frame', slug: 'classic-wooden-frame' }],
          categories: [{ id: 'c1', name: 'Wooden Frames', slug: 'wooden-frames', image: '/categories/wooden.jpg' }],
          popularSearches: [],
        }),
      })
    );
    render(<SearchTypeahead />);
    fireEvent.change(screen.getByPlaceholderText('Search for frames, gifts and more...'), { target: { value: 'wood' } });
    await waitFor(() => expect(screen.getByText('Classic Wooden Frame')).toBeInTheDocument());
    const categoryLink = screen.getByRole('link', { name: /Wooden Frames/ });
    expect(categoryLink).toHaveAttribute('href', '/category/wooden-frames');
    expect(categoryLink.querySelector('img')).toBeInTheDocument();
  });
});

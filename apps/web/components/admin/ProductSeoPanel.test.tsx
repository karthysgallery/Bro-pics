import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { ProductSeoPanel, type ProductSeoValue } from './ProductSeoPanel';

const product = {
  title: 'Thalapathy Vijay Photo Frame',
  slug: 'classic-frame-01',
  shortDesc: 'A teak-finish frame for your favourite photo.',
  descriptionHtml: '<p>Handmade frame.</p>',
  hasImage: true,
};

function Harness({ onSlug = vi.fn() }: { onSlug?: (s: string) => void }) {
  const [value, setValue] = useState<ProductSeoValue>({ seoTitle: '', seoDesc: '', focusKeyword: '', keywords: [], imageAlt: '', noindex: false });
  return (
    <>
      <ProductSeoPanel value={value} onChange={(n) => setValue((p) => ({ ...p, ...n }))} product={product} onSlugChange={onSlug} />
      <output data-testid="state">{JSON.stringify(value)}</output>
    </>
  );
}

const state = () => JSON.parse(screen.getByTestId('state').textContent!) as ProductSeoValue;

describe('ProductSeoPanel', () => {
  it('shows a Google preview and a score that rises with a focus keyword', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Google search preview')).toHaveTextContent('Thalapathy Vijay Photo Frame | KarthysGallery');
    const before = Number(screen.getByLabelText(/SEO score/).textContent!.match(/\d+/)![0]);
    fireEvent.change(screen.getByPlaceholderText('vijay photo frame'), { target: { value: 'vijay frame' } });
    const after = Number(screen.getByLabelText(/SEO score/).textContent!.match(/\d+/)![0]);
    expect(after).toBeGreaterThan(before);
  });

  it('fills empty fields from suggestions and offers a keyword slug', () => {
    const onSlug = vi.fn();
    render(<Harness onSlug={onSlug} />);
    fireEvent.change(screen.getByPlaceholderText('vijay photo frame'), { target: { value: 'vijay frame' } });
    fireEvent.click(screen.getByRole('button', { name: /Fill empty fields/ }));
    expect(state().seoTitle).toMatch(/Vijay/);
    expect(state().seoDesc).toMatch(/vijay frame/);
    expect(state().imageAlt).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Use address/ }));
    expect(onSlug).toHaveBeenCalledWith('thalapathy-vijay-photo-frame');
  });

  it('adds and removes related phrases, and toggles hiding from Google', () => {
    render(<Harness />);
    const input = screen.getByPlaceholderText(/thalapathy vijay frame/);
    fireEvent.change(input, { target: { value: 'Vijay Fan Gift' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.change(input, { target: { value: 'tvk frame,' } });
    expect(state().keywords).toEqual(['vijay fan gift', 'tvk frame']);
    fireEvent.click(screen.getByRole('button', { name: 'Remove tvk frame' }));
    expect(state().keywords).toEqual(['vijay fan gift']);
    fireEvent.click(screen.getByRole('checkbox', { name: /Hide this product from Google/ }));
    expect(state().noindex).toBe(true);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { Header } from './Header';
import { CartProvider } from '../../lib/cart-context';
import { AuthProvider } from '../../lib/auth-context';
import type { Category } from '@bro-pics/shared';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
}));
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  onAuthStateChanged: vi.fn((_auth, callback) => {
    callback(null);
    return () => {};
  }),
}));

const categories: Category[] = [
  { id: 'cat_frames', name: 'Frames & Wall Décor', slug: 'frames-wall-decor', parentId: null, image: '', sortOrder: 1, isActive: true, seo: {} },
];

describe('[FE-44] Header accessibility', () => {
  it('has no axe violations', async () => {
    const { container } = render(
      <AuthProvider>
        <CartProvider>
          <Header categories={categories} onCartClick={() => {}} />
        </CartProvider>
      </AuthProvider>
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

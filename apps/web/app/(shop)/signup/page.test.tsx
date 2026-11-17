import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import SignUpPage from './page';

const replace = vi.fn();
let params: Record<string, string> = {};
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => ({ get: (key: string) => params[key] ?? null }),
}));

describe('SignUpPage', () => {
  it('sends new customers to the one-step WhatsApp sign-in', async () => {
    params = {};
    render(<SignUpPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/signin'));
  });

  it('keeps where the customer was going (e.g. checkout)', async () => {
    params = { redirect: '/checkout' };
    render(<SignUpPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/signin?redirect=%2Fcheckout'));
  });
});

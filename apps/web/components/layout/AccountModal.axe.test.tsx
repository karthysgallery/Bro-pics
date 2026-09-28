import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { AccountModal } from './AccountModal';

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  RecaptchaVerifier: vi.fn(),
  signInWithPhoneNumber: vi.fn(),
}));

describe('[FE-44] AccountModal accessibility', () => {
  it('has no axe violations when open', async () => {
    const { container } = render(<AccountModal isOpen={true} onClose={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

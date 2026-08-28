import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import RootLayout from './layout';

describe('RootLayout', () => {
  it('renders its children', () => {
    render(
      <RootLayout>
        <p>Test child content</p>
      </RootLayout>
    );
    expect(screen.getByText('Test child content')).toBeInTheDocument();
  });
});

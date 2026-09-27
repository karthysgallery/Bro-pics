import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StorageImage } from './StorageImage';

vi.mock('../../lib/use-media-url', () => ({
  useMediaUrl: vi.fn(),
}));

import { useMediaUrl } from '../../lib/use-media-url';

describe('StorageImage', () => {
  it('renders a skeleton fallback while the path is unresolved', () => {
    vi.mocked(useMediaUrl).mockReturnValue(null);
    render(<StorageImage path="uploads/sess_1/photo.jpg" alt="A photo" width={64} height={64} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders the resolved image once available', () => {
    vi.mocked(useMediaUrl).mockReturnValue('https://signed.example.com/fresh.jpg');
    render(<StorageImage path="uploads/sess_1/photo.jpg" alt="A photo" width={64} height={64} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('alt', 'A photo');
  });

  it('renders a custom fallback in place of the default skeleton', () => {
    vi.mocked(useMediaUrl).mockReturnValue(null);
    render(
      <StorageImage path={null} alt="A photo" width={64} height={64} fallback={<span>No photo</span>} />
    );
    expect(screen.getByText('No photo')).toBeInTheDocument();
  });
});

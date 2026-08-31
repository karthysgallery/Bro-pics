import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PersonalizeComingSoonModal } from './PersonalizeComingSoonModal';

describe('PersonalizeComingSoonModal', () => {
  it('renders nothing when closed', () => {
    render(<PersonalizeComingSoonModal isOpen={false} onClose={() => {}} />);
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it('renders the coming-soon message when open', () => {
    render(<PersonalizeComingSoonModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<PersonalizeComingSoonModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

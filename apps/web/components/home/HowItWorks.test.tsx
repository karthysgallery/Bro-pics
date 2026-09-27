import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HowItWorks } from './HowItWorks';

describe('HowItWorks', () => {
  it('[FE-26] falls back to the default steps when the section has none', () => {
    render(<HowItWorks title="How It Works" />);
    expect(screen.getByText('Upload')).toBeInTheDocument();
    expect(screen.getByText('Order')).toBeInTheDocument();
  });

  it('[FE-26] renders steps from section data instead of the hardcoded defaults when given', () => {
    render(
      <HowItWorks
        title="How It Works"
        steps={[
          { label: 'Snap', desc: 'Take a photo on your phone.' },
          { label: 'Frame it', desc: 'Pick a frame that suits it.' },
        ]}
      />
    );
    expect(screen.getByText('Snap')).toBeInTheDocument();
    expect(screen.getByText('Frame it')).toBeInTheDocument();
    expect(screen.queryByText('Upload')).not.toBeInTheDocument();
  });
});

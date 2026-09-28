import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConsentBanner } from './ConsentBanner';
import { hasAnalyticsConsent } from '../../lib/consent';

describe('ConsentBanner', () => {
  beforeEach(() => localStorage.clear());

  it('[FE-40] shows the banner when no choice has been made yet', async () => {
    render(<ConsentBanner />);
    expect(await screen.findByText(/We use cookies/)).toBeInTheDocument();
  });

  it('[FE-40] hides the banner and records consent when Accept is clicked', async () => {
    render(<ConsentBanner />);
    fireEvent.click(await screen.findByText('Accept'));
    expect(screen.queryByText(/We use cookies/)).not.toBeInTheDocument();
    expect(hasAnalyticsConsent()).toBe(true);
  });

  it('[FE-40] hides the banner and records the decline when Decline is clicked', async () => {
    render(<ConsentBanner />);
    fireEvent.click(await screen.findByText('Decline'));
    expect(screen.queryByText(/We use cookies/)).not.toBeInTheDocument();
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it('[FE-40] never shows again once a choice was already made', () => {
    localStorage.setItem('bropics_analytics_consent', 'accepted');
    render(<ConsentBanner />);
    expect(screen.queryByText(/We use cookies/)).not.toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnnouncementBar } from './AnnouncementBar';

// Mock gsap for DOM/SVG animations in JSDOM
vi.mock('gsap', () => ({
  gsap: {
    to: vi.fn(() => ({
      pause: vi.fn(),
      resume: vi.fn(),
      kill: vi.fn(),
    })),
  },
}));

describe('AnnouncementBar with TextLoop', () => {
  it('renders default announcement text in TextLoop SVG', () => {
    render(<AnnouncementBar />);
    expect(screen.getByLabelText(/announcements/i)).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /Made for your memories/i })
    ).toBeInTheDocument();
  });

  it('renders custom text when provided', () => {
    render(<AnnouncementBar text="Special Diwali Offer ✦ 20% OFF Frames" />);
    expect(
      screen.getByRole('img', { name: /Special Diwali Offer/i })
    ).toBeInTheDocument();
  });

  it('renders a link when link prop is supplied', () => {
    render(
      <AnnouncementBar
        text="Special Offer"
        link="/frames"
      />
    );
    const linkElement = screen.getByRole('link', { name: /announcement link/i });
    expect(linkElement).toBeInTheDocument();
    expect(linkElement).toHaveAttribute('href', '/frames');
  });
});

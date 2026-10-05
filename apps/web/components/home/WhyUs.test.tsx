import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WhyUs } from './WhyUs';

describe('WhyUs', () => {
  it('treats a stored legacy "Why BroPics" title as the default heading rather than showing the old brand', () => {
    render(<WhyUs title="Why BroPics" />);
    expect(screen.queryByText('Why BroPics')).not.toBeInTheDocument();
  });

  it('[FE-26] falls back to the default value props when the section has none', () => {
    render(<WhyUs title="Why KarthysGallery" />);
    expect(screen.getByText(/Handcrafted with premium materials/)).toBeInTheDocument();
  });

  it('[FE-26] renders value props from section data instead of the hardcoded defaults when given', () => {
    render(<WhyUs title="Why KarthysGallery" valueProps={['Made in India', '5-year frame guarantee']} />);
    expect(screen.getByText('Made in India')).toBeInTheDocument();
    expect(screen.getByText('5-year frame guarantee')).toBeInTheDocument();
    expect(screen.queryByText(/Handcrafted with premium materials/)).not.toBeInTheDocument();
  });
});

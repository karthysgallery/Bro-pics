import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeliveryTimeline } from './DeliveryTimeline';

describe('DeliveryTimeline', () => {
  it('shows an estimated delivery window derived from dispatch days', () => {
    render(<DeliveryTimeline dispatchDaysMin={3} dispatchDaysMax={5} />);
    expect(screen.getByTestId('delivery-timeline')).toBeInTheDocument();
    expect(screen.getByText('Estimated delivery: 6-11 days from order')).toBeInTheDocument();
  });

  it('shows the four timeline steps', () => {
    render(<DeliveryTimeline dispatchDaysMin={2} dispatchDaysMax={4} />);
    expect(screen.getByText('Order confirmed')).toBeInTheDocument();
    expect(screen.getByText('Printed & packed')).toBeInTheDocument();
    expect(screen.getByText('Shipped')).toBeInTheDocument();
    expect(screen.getByText('Delivered')).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterPanel } from './FilterPanel';

describe('FilterPanel', () => {
  it('renders the available sizes as chips and colours as design swatches', () => {
    render(
      <FilterPanel
        availableSizes={['8x12 in', '12x18 in']}
        availableColours={['Black', 'White']}
        availableOrientations={['portrait', 'landscape']}
        selectedSizes={['8x12 in']}
        selectedColours={[]}
        selectedOrientations={[]}
        onToggleSize={vi.fn()}
        onToggleColour={vi.fn()}
        onToggleOrientation={vi.fn()}
        onClearAll={vi.fn()}
      />
    );
    expect(screen.getByText('8x12 in')).toBeInTheDocument();
    expect(screen.getByLabelText('Black')).toBeInTheDocument();
    expect(screen.getByText('Portrait')).toBeInTheDocument();
  });

  it('calls onToggleSize with the clicked size', () => {
    const onToggleSize = vi.fn();
    render(
      <FilterPanel
        availableSizes={['8x12 in']}
        availableColours={[]}
        availableOrientations={[]}
        selectedSizes={[]}
        selectedColours={[]}
        selectedOrientations={[]}
        onToggleSize={onToggleSize}
        onToggleColour={vi.fn()}
        onToggleOrientation={vi.fn()}
        onClearAll={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('8x12 in'));
    expect(onToggleSize).toHaveBeenCalledWith('8x12 in');
  });

  it('calls onToggleColour with the clicked frame design swatch', () => {
    const onToggleColour = vi.fn();
    render(
      <FilterPanel
        availableSizes={[]}
        availableColours={['Black']}
        availableOrientations={[]}
        selectedSizes={[]}
        selectedColours={[]}
        selectedOrientations={[]}
        onToggleSize={vi.fn()}
        onToggleColour={onToggleColour}
        onToggleOrientation={vi.fn()}
        onClearAll={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText('Black'));
    expect(onToggleColour).toHaveBeenCalledWith('Black');
  });

  it('[FE-30] renders rating and availability filters only when their handlers are given', () => {
    render(
      <FilterPanel
        availableSizes={[]}
        availableColours={[]}
        availableOrientations={[]}
        selectedSizes={[]}
        selectedColours={[]}
        selectedOrientations={[]}
        onToggleSize={vi.fn()}
        onToggleColour={vi.fn()}
        onToggleOrientation={vi.fn()}
        onClearAll={vi.fn()}
      />
    );
    expect(screen.queryByText('Rating')).not.toBeInTheDocument();
    expect(screen.queryByText('Availability')).not.toBeInTheDocument();
  });

  it('[FE-30] calls onSetMinRating with the clicked rating, and clears it on a second click', () => {
    const onSetMinRating = vi.fn();
    render(
      <FilterPanel
        availableSizes={[]}
        availableColours={[]}
        availableOrientations={[]}
        selectedSizes={[]}
        selectedColours={[]}
        selectedOrientations={[]}
        onToggleSize={vi.fn()}
        onToggleColour={vi.fn()}
        onToggleOrientation={vi.fn()}
        onClearAll={vi.fn()}
        minRating={4}
        onSetMinRating={onSetMinRating}
      />
    );
    fireEvent.click(screen.getByText('3★ & up'));
    expect(onSetMinRating).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByText('4★ & up'));
    expect(onSetMinRating).toHaveBeenCalledWith(null);
  });

  it('[FE-30] calls onToggleInStockOnly when the availability checkbox is toggled', () => {
    const onToggleInStockOnly = vi.fn();
    render(
      <FilterPanel
        availableSizes={[]}
        availableColours={[]}
        availableOrientations={[]}
        selectedSizes={[]}
        selectedColours={[]}
        selectedOrientations={[]}
        onToggleSize={vi.fn()}
        onToggleColour={vi.fn()}
        onToggleOrientation={vi.fn()}
        onClearAll={vi.fn()}
        inStockOnly={false}
        onToggleInStockOnly={onToggleInStockOnly}
      />
    );
    fireEvent.click(screen.getByLabelText('In stock only'));
    expect(onToggleInStockOnly).toHaveBeenCalledOnce();
  });

  it('calls onClearAll when Clear All is clicked', () => {
    const onClearAll = vi.fn();
    render(
      <FilterPanel
        availableSizes={[]}
        availableColours={[]}
        availableOrientations={[]}
        selectedSizes={[]}
        selectedColours={[]}
        selectedOrientations={[]}
        onToggleSize={vi.fn()}
        onToggleColour={vi.fn()}
        onToggleOrientation={vi.fn()}
        onClearAll={onClearAll}
      />
    );
    fireEvent.click(screen.getByText('Clear all'));
    expect(onClearAll).toHaveBeenCalledOnce();
  });
});

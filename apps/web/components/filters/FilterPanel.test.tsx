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

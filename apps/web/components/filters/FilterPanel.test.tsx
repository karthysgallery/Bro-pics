import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterPanel } from './FilterPanel';

describe('FilterPanel', () => {
  it('renders the available sizes and colours as toggleable chips', () => {
    render(
      <FilterPanel
        availableSizes={['8x12 in', '12x18 in']}
        availableColours={['Black', 'White']}
        selectedSizes={['8x12 in']}
        selectedColours={[]}
        onToggleSize={vi.fn()}
        onToggleColour={vi.fn()}
        onClearAll={vi.fn()}
      />
    );
    expect(screen.getByText('8x12 in')).toBeInTheDocument();
    expect(screen.getByText('Black')).toBeInTheDocument();
  });

  it('calls onToggleSize with the clicked size', () => {
    const onToggleSize = vi.fn();
    render(
      <FilterPanel
        availableSizes={['8x12 in']}
        availableColours={[]}
        selectedSizes={[]}
        selectedColours={[]}
        onToggleSize={onToggleSize}
        onToggleColour={vi.fn()}
        onClearAll={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('8x12 in'));
    expect(onToggleSize).toHaveBeenCalledWith('8x12 in');
  });

  it('calls onClearAll when Clear All is clicked', () => {
    const onClearAll = vi.fn();
    render(
      <FilterPanel
        availableSizes={[]}
        availableColours={[]}
        selectedSizes={[]}
        selectedColours={[]}
        onToggleSize={vi.fn()}
        onToggleColour={vi.fn()}
        onClearAll={onClearAll}
      />
    );
    fireEvent.click(screen.getByText('Clear all'));
    expect(onClearAll).toHaveBeenCalledOnce();
  });
});

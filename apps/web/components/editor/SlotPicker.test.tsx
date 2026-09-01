import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SlotPicker } from './SlotPicker';

describe('SlotPicker', () => {
  it('renders one button per slot', () => {
    render(<SlotPicker slotCount={3} activeSlotIndex={0} filledSlots={new Set()} onSelectSlot={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('marks the active slot', () => {
    render(<SlotPicker slotCount={2} activeSlotIndex={1} filledSlots={new Set()} onSelectSlot={() => {}} />);
    expect(screen.getByRole('button', { name: /slot 2/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('marks filled slots distinctly from empty ones', () => {
    render(<SlotPicker slotCount={2} activeSlotIndex={0} filledSlots={new Set([1])} onSelectSlot={() => {}} />);
    expect(screen.getByRole('button', { name: /slot 2/i })).toHaveTextContent('✓');
  });

  it('calls onSelectSlot with the clicked slot index', () => {
    const onSelectSlot = vi.fn();
    render(<SlotPicker slotCount={2} activeSlotIndex={0} filledSlots={new Set()} onSelectSlot={onSelectSlot} />);
    fireEvent.click(screen.getByRole('button', { name: /slot 2/i }));
    expect(onSelectSlot).toHaveBeenCalledWith(1);
  });
});

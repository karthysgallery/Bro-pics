import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { SlotPicker } from './SlotPicker';

describe('[FE-44] SlotPicker accessibility', () => {
  it('has no axe violations', async () => {
    const { container } = render(
      <SlotPicker slotCount={3} activeSlotIndex={0} filledSlots={new Set([1])} onSelectSlot={() => {}} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

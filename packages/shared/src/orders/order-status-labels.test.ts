import { describe, it, expect } from 'vitest';
import { OrderStatusSchema } from '../schemas/order';
import { MAIN_STEPS, STEP_LABELS, STEPPER_POSITION, STATUS_CHIP_STYLES, statusLabel } from './order-status-labels';

const ALL_STATUSES = OrderStatusSchema.options;

describe('order-status-labels [FE-21]', () => {
  it('has a label, chip style, and stepper position for every real OrderStatus', () => {
    for (const status of ALL_STATUSES) {
      expect(STEP_LABELS[status]).toBeTruthy();
      expect(STATUS_CHIP_STYLES[status]).toBeTruthy();
      expect(STEPPER_POSITION[status]).toBeTruthy();
    }
  });

  it('maps every stepper position onto a real step in MAIN_STEPS', () => {
    for (const status of ALL_STATUSES) {
      expect(MAIN_STEPS).toContain(STEPPER_POSITION[status]);
    }
  });

  it('statusLabel is the same lookup as STEP_LABELS', () => {
    for (const status of ALL_STATUSES) {
      expect(statusLabel(status)).toBe(STEP_LABELS[status]);
    }
  });
});

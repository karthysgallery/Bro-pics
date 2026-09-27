import type { OrderStatus } from '@bro-pics/shared';
// [FE-21] The actual label/colour/stepper-position data now lives in
// packages/shared (order-status-labels.ts) so any package, not just
// apps/web, can read the same source — this file re-exports
// STATUS_CHIP_STYLES/statusLabel unchanged so every existing import site
// (the customer order list, admin queue rows) needs no changes.
import { MAIN_STEPS, STEP_LABELS, STEPPER_POSITION, STATUS_CHIP_STYLES, statusLabel } from '@bro-pics/shared';

export { STATUS_CHIP_STYLES, statusLabel };

interface OrderStatusTimelineProps {
  status: OrderStatus;
}

// A visual stepper for the 6 forward-moving statuses. The three side-states
// (cancelled/refunded/replacement_issued) don't fit a stepper — they don't
// represent forward progress — so they render as a banner instead of a step
// position. Styled with plain neutral/semantic colours rather than either
// brand palette (this component renders on both the storefront's account
// pages and inside /app/admin, which are on two different, independently
// moving colour palettes) so it never looks wrong on either side.
export function OrderStatusTimeline({ status }: OrderStatusTimelineProps) {
  const isSideState = status === 'cancelled' || status === 'refunded' || status === 'replacement_issued';

  if (isSideState) {
    const bannerStyles: Record<'cancelled' | 'refunded' | 'replacement_issued', string> = {
      cancelled: 'bg-red-50 text-red-700 border-red-200',
      refunded: 'bg-amber-50 text-amber-700 border-amber-200',
      replacement_issued: 'bg-amber-50 text-amber-700 border-amber-200',
    };
    return (
      <div
        role="status"
        className={`rounded-lg border px-4 py-3 text-sm font-medium ${bannerStyles[status]}`}
      >
        {STEP_LABELS[status]}
      </div>
    );
  }

  const currentIndex = MAIN_STEPS.indexOf(STEPPER_POSITION[status]);

  return (
    <ol role="list" aria-label="Order status" className="flex flex-col gap-0">
      {MAIN_STEPS.map((step, index) => {
        const isComplete = index <= currentIndex;
        const isLast = index === MAIN_STEPS.length - 1;
        return (
          <li key={step} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                aria-hidden="true"
                className={`w-3 h-3 rounded-full flex-shrink-0 ${isComplete ? 'bg-green-600' : 'bg-neutral-300'}`}
              />
              {!isLast && <span aria-hidden="true" className={`w-0.5 flex-1 min-h-[1.5rem] ${index < currentIndex ? 'bg-green-600' : 'bg-neutral-200'}`} />}
            </div>
            <span className={`text-sm pb-6 ${isComplete ? 'text-neutral-900 font-medium' : 'text-neutral-400'}`}>
              {STEP_LABELS[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

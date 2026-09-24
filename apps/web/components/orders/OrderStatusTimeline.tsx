import type { OrderStatus } from '@bro-pics/shared';

const MAIN_STEPS: OrderStatus[] = ['pending_payment', 'paid', 'in_production', 'printed_packed', 'shipped', 'delivered'];

const STEP_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Awaiting payment',
  paid: 'Payment confirmed',
  // [BE-18] System-driven sub-stages between paid and in_production —
  // fine-grained enough to be useful in the admin queue, but the
  // customer-facing stepper below (MAIN_STEPS) collapses all four into
  // the same 'paid' position rather than adding four more steps for
  // internal fulfillment plumbing the customer doesn't act on.
  payment_confirmed: 'Payment confirmed',
  photo_validation: 'Checking your photos',
  print_rendering: 'Preparing your print',
  print_ready: 'Ready to print',
  in_production: 'In production',
  printed_packed: 'Printed & packed',
  // [ABE-16] Same "internal sub-stage, no new customer-facing step"
  // treatment as the BE-18 payment sub-stages above.
  quality_check: 'Quality check',
  packed: 'Packed',
  rework: 'Reprinting',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  replacement_issued: 'Replacement issued',
};

// Where each real OrderStatus should render in the 6-step customer
// stepper — every BE-18 sub-stage maps to the same position as 'paid'
// itself, since none of them represent a customer-visible milestone.
const STEPPER_POSITION: Record<OrderStatus, OrderStatus> = {
  pending_payment: 'pending_payment',
  paid: 'paid',
  payment_confirmed: 'paid',
  photo_validation: 'paid',
  print_rendering: 'paid',
  print_ready: 'paid',
  in_production: 'in_production',
  printed_packed: 'printed_packed',
  // quality_check/rework are internal production sub-stages (same
  // treatment as in_production itself); packed lands at the same
  // stepper position printed_packed already occupies.
  quality_check: 'in_production',
  rework: 'in_production',
  packed: 'printed_packed',
  shipped: 'shipped',
  delivered: 'delivered',
  cancelled: 'paid',
  refunded: 'paid',
  replacement_issued: 'delivered',
};

// Used on both the customer order-list (a compact chip) and admin queue
// rows — a single label/colour source so the two never drift.
export const STATUS_CHIP_STYLES: Record<OrderStatus, string> = {
  pending_payment: 'bg-neutral-100 text-neutral-700',
  paid: 'bg-blue-50 text-blue-700',
  payment_confirmed: 'bg-blue-50 text-blue-700',
  photo_validation: 'bg-blue-50 text-blue-700',
  print_rendering: 'bg-blue-50 text-blue-700',
  print_ready: 'bg-blue-50 text-blue-700',
  in_production: 'bg-blue-50 text-blue-700',
  printed_packed: 'bg-blue-50 text-blue-700',
  quality_check: 'bg-blue-50 text-blue-700',
  packed: 'bg-blue-50 text-blue-700',
  rework: 'bg-amber-50 text-amber-700',
  shipped: 'bg-blue-50 text-blue-700',
  delivered: 'bg-green-50 text-green-700',
  cancelled: 'bg-red-50 text-red-700',
  refunded: 'bg-amber-50 text-amber-700',
  replacement_issued: 'bg-amber-50 text-amber-700',
};

export function statusLabel(status: OrderStatus): string {
  return STEP_LABELS[status];
}

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

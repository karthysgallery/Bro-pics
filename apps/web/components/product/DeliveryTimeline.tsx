// Transit time (courier pickup to doorstep) once an order ships. Not sourced
// from product/order data — no such field exists yet (couriers/AWBs are
// entered manually per order, see PROJECT_STATUS.md) — so this is a fixed,
// clearly-labelled estimate rather than a per-order guarantee. Exported so
// the checkout page's delivery-method selector can quote the same standard-
// transit range instead of a second, possibly-drifting copy of "3-6 days".
export const TRANSIT_DAYS_MIN = 3;
export const TRANSIT_DAYS_MAX = 6;

interface DeliveryTimelineProps {
  dispatchDaysMin: number;
  dispatchDaysMax: number;
}

export function DeliveryTimeline({ dispatchDaysMin, dispatchDaysMax }: DeliveryTimelineProps) {
  const deliveryMin = dispatchDaysMin + TRANSIT_DAYS_MIN;
  const deliveryMax = dispatchDaysMax + TRANSIT_DAYS_MAX;

  const steps = [
    { label: 'Order confirmed', detail: 'Right after checkout' },
    { label: 'Printed & packed', detail: `${dispatchDaysMin}-${dispatchDaysMax} days` },
    { label: 'Shipped', detail: 'Courier pickup' },
    { label: 'Delivered', detail: `${deliveryMin}-${deliveryMax} days` },
  ];

  return (
    <div data-testid="delivery-timeline" className="mt-4 mb-4 rounded-2xl bg-tint p-4">
      <p className="text-xs font-semibold text-ink">
        Estimated delivery: {deliveryMin}-{deliveryMax} days from order
      </p>

      {/* Four steps across one row is what made this collide: in a ~340px
          sidebar each step got ~80px, so "Order confirmed" wrapped straight
          through the next step's marker. Two per row gives every label a
          full line, and the numbers carry the sequence that the connecting
          rules used to. */}
      <ol className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-3.5">
        {steps.map((step, index) => (
          <li key={step.label} className="flex items-start gap-2">
            <span
              className="mt-px w-[18px] h-[18px] rounded-full bg-accent text-paper text-[10px] font-semibold flex items-center justify-center shrink-0"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-2xs font-semibold leading-snug text-ink">{step.label}</span>
              <span className="block text-2xs leading-snug text-ink/55">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

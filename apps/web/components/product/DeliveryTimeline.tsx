// Transit time (courier pickup to doorstep) once an order ships. Not sourced
// from product/order data — no such field exists yet (couriers/AWBs are
// entered manually per order, see PROJECT_STATUS.md) — so this is a fixed,
// clearly-labelled estimate rather than a per-order guarantee.
const TRANSIT_DAYS_MIN = 3;
const TRANSIT_DAYS_MAX = 6;

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
    <div data-testid="delivery-timeline" className="mt-4 mb-4 rounded-lg border border-charcoal/10 p-4">
      <p className="text-sm font-medium mb-3">
        Estimated delivery: {deliveryMin}-{deliveryMax} days from order
      </p>
      <ol className="flex flex-wrap gap-y-3">
        {steps.map((step, index) => (
          <li key={step.label} className="flex items-center flex-1 min-w-[45%] sm:min-w-0">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-sage text-cream text-xs flex items-center justify-center flex-shrink-0">
                {index + 1}
              </span>
              <div>
                <p className="text-xs font-medium leading-tight">{step.label}</p>
                <p className="text-xs text-charcoal/60 leading-tight">{step.detail}</p>
              </div>
            </div>
            {index < steps.length - 1 && (
              <div className="hidden sm:block flex-1 h-px bg-charcoal/10 mx-3" aria-hidden="true" />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

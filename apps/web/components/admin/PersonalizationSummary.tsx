import { checkCompleteness, formatCalendarDate, type OrderPersonalizationSnapshot, type PrintSizeIn } from '@bro-pics/shared';

const TIER_STYLE = { green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', red: 'bg-red-50 text-red-700' } as const;
const TIER_LABEL = { green: 'Sharp', amber: 'Acceptable', red: 'Low resolution' } as const;

/**
 * What the customer actually bought, read from the order item's frozen snapshot — the
 * template version and their choices at purchase time, not whatever the template looks
 * like today. Tier is shown as a word as well as a colour.
 */
export function PersonalizationSummary({ snapshot, printSizeIn }: { snapshot: OrderPersonalizationSnapshot; printSizeIn?: PrintSizeIn }) {
  const { template, state } = snapshot;
  // Sharpness at the size the customer bought (the same check the editor and checkout used).
  const status = checkCompleteness(template, state, { printSizeIn });
  const statusBySlot = new Map(status.slots.map((s) => [s.slotId, s]));

  return (
    <section aria-label="Personalization" className="mt-3 rounded-xl border border-line bg-field/50 p-3 text-2xs space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-bold text-ink uppercase tracking-wider">Personalization</span>
        <span className="text-ink/70">
          {template.name} · <span className="font-mono">{snapshot.templateId}</span> v{snapshot.templateVersion}
        </span>
        <span className="text-ink/50">canvas {template.canvas.width}×{template.canvas.height}px @ {template.canvas.dpi} DPI</span>
      </div>

      {template.type === 'ready_made' && template.photoSlots.length === 0 ? (
        <p className="text-ink/70">Ready-made frame: prints the shop&apos;s own artwork. Nothing to check from the customer.</p>
      ) : (
        <table className="w-full text-left">
          <caption className="sr-only">Photos placed in each slot</caption>
          <thead className="text-ink/50">
            <tr>
              <th scope="col" className="py-1 pr-2 font-semibold">Slot</th>
              <th scope="col" className="py-1 pr-2 font-semibold">Photo (upload id)</th>
              <th scope="col" className="py-1 pr-2 font-semibold">Zoom</th>
              <th scope="col" className="py-1 pr-2 font-semibold">Rotation</th>
              <th scope="col" className="py-1 font-semibold">Print quality</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {template.photoSlots.map((slot) => {
              const photo = state.slots[slot.id];
              const s = statusBySlot.get(slot.id);
              return (
                <tr key={slot.id}>
                  <th scope="row" className="py-1 pr-2 font-medium text-ink">
                    {slot.label}
                    {!slot.required && <span className="text-ink/40"> (optional)</span>}
                  </th>
                  {photo ? (
                    <>
                      <td className="py-1 pr-2 font-mono text-ink/70 break-all">{photo.assetId}</td>
                      <td className="py-1 pr-2">{photo.transform.scale.toFixed(2)}×</td>
                      <td className="py-1 pr-2">{photo.rotation}°</td>
                      <td className="py-1">
                        {s?.tier && (
                          <span className={`rounded-full px-2 py-0.5 font-semibold ${TIER_STYLE[s.tier]}`}>
                            {TIER_LABEL[s.tier]}
                            {s.dpi ? ` · ${Math.round(s.dpi)} dpi` : ''}
                            {photo.confirmedLowDpi && s.tier === 'red' ? ' · customer accepted' : ''}
                          </span>
                        )}
                      </td>
                    </>
                  ) : (
                    <td colSpan={4} className="py-1 text-ink/40">
                      Left empty
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {(template.calendarSlots ?? []).length > 0 && (
        <dl className="space-y-1">
          {(template.calendarSlots ?? []).map((slot) => {
            const date = state.dates?.[slot.id]?.date ?? slot.defaultDate;
            return (
              <div key={slot.id} className="flex gap-2">
                <dt className="font-semibold text-ink">{slot.label}:</dt>
                <dd className="text-ink/80">{date ? formatCalendarDate(date) : <span className="text-ink/40">—</span>}</dd>
              </div>
            );
          })}
        </dl>
      )}

      {template.textSlots.length > 0 && (
        <dl className="space-y-1">
          {template.textSlots.map((slot) => {
            const text = state.texts[slot.id];
            return (
              <div key={slot.id} className="flex gap-2">
                <dt className="font-semibold text-ink">{slot.label}:</dt>
                <dd className="text-ink/80">{text?.value?.trim() ? `“${text.value}”` : <span className="text-ink/40">—</span>}</dd>
              </div>
            );
          })}
        </dl>
      )}
    </section>
  );
}

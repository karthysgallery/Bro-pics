'use client';

import { useEffect, useRef } from 'react';
import type { TemplateCustomizer } from './use-template-customizer';

/** A filled photo space whose photo is too small for a sharp print and has not been accepted yet. */
export function unconfirmedLowRes(customizer: TemplateCustomizer) {
  const { template, state, completeness } = customizer;
  return completeness.slots
    .filter((s) => s.tier === 'red' && state.slots[s.slotId] && !state.slots[s.slotId]!.confirmedLowDpi)
    .map((s) => ({ slot: template.photoSlots.find((p) => p.id === s.slotId)!, dpi: s.dpi, index: template.photoSlots.findIndex((p) => p.id === s.slotId) }))
    .filter((r) => r.slot);
}

interface Props {
  customizer: TemplateCustomizer;
  open: boolean;
  onClose: () => void;
  /** Called after every low-resolution photo was accepted, so adding to the cart can carry on. */
  onAllAccepted: () => void;
  onReplace: (slotId: string) => void;
}

/**
 * Shown when "Add to cart" is pressed while some photos are too small for a sharp print. The customer sees every one
 * of them in one place (not only the photo that happens to be selected) and can accept them, or change them.
 */
export function LowResDialog({ customizer, open, onClose, onAllAccepted, onReplace }: Props) {
  const rows = unconfirmedLowRes(customizer);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    dialog.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Once the last one is accepted, continue straight to the cart.
  useEffect(() => {
    if (open && rows.length === 0) onAllAccepted();
  }, [open, rows.length, onAllAccepted]);

  if (!open || rows.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lowres-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-paper p-5 shadow-xl sm:rounded-2xl"
      >
        <h2 id="lowres-title" className="text-base font-bold text-ink">
          {rows.length === 1 ? '1 photo may print soft' : `${rows.length} photos may print soft`}
        </h2>
        <p className="mt-1 text-sm text-ink/70">
          {rows.length === 1 ? 'This photo is' : 'These photos are'} small for the frame size you chose, so {rows.length === 1 ? 'it' : 'they'} may look
          blurry when printed. Use a larger photo for a sharp print, or print {rows.length === 1 ? 'it' : 'them'} as {rows.length === 1 ? 'it is' : 'they are'}.
        </p>
        <ul className="mt-4 space-y-2">
          {rows.map(({ slot, dpi, index }) => {
            const photo = customizer.state.slots[slot.id]!;
            const src = customizer.render.photoSrc(slot.id, photo);
            return (
              <li key={slot.id} className="flex items-center gap-3 rounded-xl border border-line p-2">
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="h-14 w-14 shrink-0 rounded-lg bg-tint" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">Photo {index + 1}</p>
                  <p className="text-xs text-ink/60">{dpi ? `${Math.round(dpi)} DPI at this size` : 'Low resolution'}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => customizer.setLowDpiConfirmed(slot.id, true)}
                    className="h-8 rounded-lg bg-ink px-3 text-xs font-semibold text-paper"
                  >
                    Print anyway
                  </button>
                  <button type="button" onClick={() => onReplace(slot.id)} className="h-8 rounded-lg border border-line px-3 text-xs font-semibold text-ink">
                    Change photo
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => rows.forEach((r) => customizer.setLowDpiConfirmed(r.slot.id, true))}
              className="h-11 flex-1 rounded-full bg-gold text-sm font-bold text-ink"
            >
              Print all anyway & add to cart
            </button>
          )}
          <button type="button" onClick={onClose} className="h-11 flex-1 rounded-full border border-line text-sm font-semibold text-ink">
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}

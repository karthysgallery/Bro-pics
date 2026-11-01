import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LowResDialog, unconfirmedLowRes } from './LowResDialog';
import type { TemplateCustomizer } from './use-template-customizer';

function fake(confirmed: Record<string, boolean>) {
  const photo = (id: string) => ({ assetId: id, confirmedLowDpi: confirmed[id] ?? false });
  return {
    template: { photoSlots: [{ id: 'a', label: 'Photo 1' }, { id: 'b', label: 'Photo 2' }, { id: 'c', label: 'Photo 3' }] },
    state: { slots: { a: photo('a'), b: photo('b'), c: photo('c') } },
    completeness: { slots: [{ slotId: 'a', tier: 'green' }, { slotId: 'b', tier: 'red', dpi: 97 }, { slotId: 'c', tier: 'red', dpi: 80 }] },
    render: { photoSrc: (id: string) => `/thumb/${id}.jpg` },
    setLowDpiConfirmed: vi.fn(),
  } as unknown as TemplateCustomizer;
}

describe('LowResDialog', () => {
  it('lists every low-resolution photo not yet accepted, not only the selected one', () => {
    const c = fake({});
    expect(unconfirmedLowRes(c).map((r) => r.slot.id)).toEqual(['b', 'c']);
    render(<LowResDialog customizer={c} open onClose={vi.fn()} onAllAccepted={vi.fn()} onReplace={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: '2 photos may print soft' })).toBeTruthy();
    expect(screen.getByText('Photo 2')).toBeTruthy();
    expect(screen.getByText('97 DPI at this size')).toBeTruthy();
  });

  it('accepts one, all, or hands back a photo to change', () => {
    const c = fake({});
    const onReplace = vi.fn();
    render(<LowResDialog customizer={c} open onClose={vi.fn()} onAllAccepted={vi.fn()} onReplace={onReplace} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Print anyway' })[0]!);
    expect(c.setLowDpiConfirmed).toHaveBeenCalledWith('b', true);
    fireEvent.click(screen.getByRole('button', { name: 'Print all anyway & add to cart' }));
    expect(c.setLowDpiConfirmed).toHaveBeenCalledWith('c', true);
    fireEvent.click(screen.getAllByRole('button', { name: 'Change photo' })[1]!);
    expect(onReplace).toHaveBeenCalledWith('c');
  });

  it('carries on to the cart once nothing is left to accept', () => {
    const onAllAccepted = vi.fn();
    render(<LowResDialog customizer={fake({ b: true, c: true })} open onClose={vi.fn()} onAllAccepted={onAllAccepted} onReplace={vi.fn()} />);
    expect(onAllAccepted).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

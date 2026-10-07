import type { OrderCombo, OrderItem } from '@bro-pics/shared';

/** An order's items as people read them: ordinary items alone, each combo's frames together under its name. */
export type OrderLineGroup<T extends Pick<OrderItem, 'combo'>> =
  | { kind: 'item'; item: T; index: number }
  | {
      kind: 'combo';
      instanceId: string;
      comboId: string;
      name: string;
      slug?: string;
      /** What the customer paid for the whole combo, when the order recorded it. */
      price: number | null;
      mrp: number | null;
      frames: Array<{ item: T; index: number; label: string }>;
    };

/**
 * Groups per-frame order items by the combo they were bought in, keeping the order of first appearance.
 * Works for the customer's order page, the invoice and the admin views, which all hold the same items.
 */
export function groupOrderItems<T extends Pick<OrderItem, 'combo'>>(items: T[], combos: OrderCombo[] | undefined): Array<OrderLineGroup<T>> {
  const byInstance = new Map((combos ?? []).map((c) => [c.instanceId, c]));
  const groups: Array<OrderLineGroup<T>> = [];
  const open = new Map<string, Extract<OrderLineGroup<T>, { kind: 'combo' }>>();

  items.forEach((item, index) => {
    const marker = item.combo;
    if (!marker) {
      groups.push({ kind: 'item', item, index });
      return;
    }
    let group = open.get(marker.instanceId);
    if (!group) {
      const record = byInstance.get(marker.instanceId);
      group = {
        kind: 'combo',
        instanceId: marker.instanceId,
        comboId: marker.comboId,
        name: record?.name ?? marker.comboName,
        ...(record?.slug && { slug: record.slug }),
        price: record?.price ?? null,
        mrp: record?.mrp ?? null,
        frames: [],
      };
      open.set(marker.instanceId, group);
      groups.push(group);
    }
    group.frames.push({ item, index, label: marker.frameLabel });
  });
  // Firestore returns an order's items in no particular order; show a combo's frames as Frame 1, 2, 3…
  const frameNumber = (label: string) => Number.parseInt(label.replace(/\D+/g, ''), 10);
  for (const group of open.values()) {
    group.frames.sort((a, b) => (frameNumber(a.label) || 0) - (frameNumber(b.label) || 0));
  }
  return groups;
}

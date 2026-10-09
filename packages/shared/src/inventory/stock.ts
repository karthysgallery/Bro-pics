import type { DocumentReference, Firestore, Transaction } from 'firebase-admin/firestore';
import { BillingError } from '../billing/invoice-engine';
import type { InventoryMovement, StockReason } from '../schemas/billing';

/**
 * The ONE place stock changes. Online orders, in-store sales, returns and
 * staff adjustments all go through these two steps inside a Firestore
 * transaction, so the website and the store always see the same number and
 * two sales at the same moment can never both take the last unit.
 *
 * Only variants with `trackStock: true` have a count (`stockQty`). Every
 * other variant is made to order: unlimited, exactly as before, and these
 * functions leave it alone.
 *
 * Server-only (firebase-admin types): import by path, not from the barrel.
 * Firestore transactions need every read before any write, hence two steps:
 *   const stock = await readStock(tx, db, lines);   // reads
 *   ...other reads...
 *   applyStock(tx, db, stock, changes, meta);       // writes
 */

export interface StockLine {
  productId: string;
  variantId: string;
}

export interface StockSnapshot {
  ref: DocumentReference;
  productId: string;
  variantId: string;
  tracked: boolean;
  qty: number;
  title: string;
}

export type StockReads = Map<string, StockSnapshot>;

const key = (l: StockLine) => `${l.productId}/${l.variantId}`;

export function variantRef(db: Firestore, l: StockLine): DocumentReference {
  return db.collection('products').doc(l.productId).collection('variants').doc(l.variantId);
}

export async function readStock(tx: Transaction, db: Firestore, lines: StockLine[]): Promise<StockReads> {
  const unique = new Map(lines.map((l) => [key(l), l]));
  const out: StockReads = new Map();
  await Promise.all(
    [...unique.values()].map(async (l) => {
      const ref = variantRef(db, l);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new BillingError('unavailable', 'One of the items is no longer in the catalogue.');
      const v = snap.data() as { trackStock?: boolean; stockQty?: number; sku?: string; sizeLabel?: string };
      out.set(key(l), { ref, productId: l.productId, variantId: l.variantId, tracked: v.trackStock === true, qty: Number.isInteger(v.stockQty) ? v.stockQty! : 0, title: v.sku ?? v.sizeLabel ?? l.variantId });
    })
  );
  return out;
}

export interface StockMeta {
  reason: StockReason;
  ref: InventoryMovement['ref'];
  by: string;
  note?: string | null;
  at?: string;
  /** Allow going below zero (a late online payment for an already-released hold); recorded, never silent. */
  allowNegative?: boolean;
}

/**
 * Applies `delta` (negative = units out) to every tracked variant and writes
 * one movement per change. Throws `insufficient_stock` before writing
 * anything if a tracked variant would go below zero.
 */
export function applyStock(tx: Transaction, db: Firestore, reads: StockReads, changes: Array<StockLine & { delta: number; label?: string }>, meta: StockMeta): InventoryMovement[] {
  // Combine several lines of the same variant (two lines of one frame size).
  const merged = new Map<string, StockLine & { delta: number; label?: string }>();
  for (const c of changes) {
    const prev = merged.get(key(c));
    merged.set(key(c), prev ? { ...prev, delta: prev.delta + c.delta } : { ...c });
  }
  const plan: Array<{ snap: StockSnapshot; delta: number }> = [];
  for (const c of merged.values()) {
    const snap = reads.get(key(c));
    if (!snap) throw new Error(`Stock for ${key(c)} was not read in this transaction`);
    if (!snap.tracked || c.delta === 0) continue;
    if (snap.qty + c.delta < 0 && !meta.allowNegative) {
      throw new BillingError('insufficient_stock', `Only ${snap.qty} left of ${c.label ?? snap.title}.`);
    }
    plan.push({ snap, delta: c.delta });
  }
  const at = meta.at ?? new Date().toISOString();
  const movements: InventoryMovement[] = [];
  for (const { snap, delta } of plan) {
    const after = snap.qty + delta;
    tx.update(snap.ref, { stockQty: after, stockStatus: after > 0 ? 'in_stock' : 'out_of_stock' });
    const mref = db.collection('inventoryMovements').doc();
    const movement: InventoryMovement = { id: mref.id, productId: snap.productId, variantId: snap.variantId, delta, before: snap.qty, after, reason: meta.reason, ref: meta.ref, note: meta.note ?? null, by: meta.by, at };
    tx.set(mref, movement);
    movements.push(movement);
    snap.qty = after; // a later change in the same transaction builds on this one
  }
  return movements;
}

/** True when any of these lines is a tracked (counted) variant. */
export function anyTracked(reads: StockReads): boolean {
  return [...reads.values()].some((s) => s.tracked);
}

// ---------------------------------------------------------------------------
// Online reservations: taken when an order is placed, released if it is
// cancelled or never paid. Stored on the order as `stockReservation`.

export interface StockReservation {
  status: 'held' | 'released';
  lines: Array<StockLine & { qty: number }>;
  heldAt: string;
  releasedAt?: string;
}

/**
 * Takes stock for an online order (tracked variants only) in its own
 * transaction. Returns the reservation to store on the order, or null when
 * nothing in the order is counted (made-to-order items: no change at all).
 */
export async function reserveOrderStock(db: Firestore, orderId: string, userId: string, items: Array<StockLine & { qty: number; title: string }>): Promise<StockReservation | null> {
  // Quick look first: an order of made-to-order items (the usual case) needs no transaction at all.
  const unique = [...new Map(items.map((i) => [key(i), i])).values()];
  const peeks = await Promise.all(unique.map((i) => variantRef(db, i).get()));
  if (!peeks.some((p) => p.exists && (p.data() as { trackStock?: boolean }).trackStock === true)) return null;
  return db.runTransaction(async (tx) => {
    const reads = await readStock(tx, db, items);
    if (!anyTracked(reads)) return null;
    applyStock(tx, db, reads, items.map((i) => ({ productId: i.productId, variantId: i.variantId, delta: -i.qty, label: i.title })), { reason: 'ONLINE_ORDER', ref: { type: 'order', id: orderId }, by: userId });
    const tracked = items.filter((i) => reads.get(key(i))?.tracked);
    return { status: 'held', lines: tracked.map((i) => ({ productId: i.productId, variantId: i.variantId, qty: i.qty })), heldAt: new Date().toISOString() };
  });
}

/** Puts an order's held stock back, once (safe to call again or concurrently). */
export async function releaseOrderStock(db: Firestore, orderId: string, by: string, note: string): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const orderRef = db.collection('orders').doc(orderId);
    const snap = await tx.get(orderRef);
    const reservation = snap.exists ? ((snap.data() as { stockReservation?: StockReservation }).stockReservation ?? null) : null;
    if (!reservation || reservation.status !== 'held' || reservation.lines.length === 0) return false;
    const reads = await readStock(tx, db, reservation.lines);
    applyStock(tx, db, reads, reservation.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, delta: l.qty })), { reason: 'ONLINE_RELEASE', ref: { type: 'order', id: orderId }, by, note });
    tx.update(orderRef, { 'stockReservation.status': 'released', 'stockReservation.releasedAt': new Date().toISOString() });
    return true;
  });
}

/** Puts back a reservation that never made it onto an order (payment session or order write failed). */
export async function restoreReservation(db: Firestore, orderId: string, reservation: StockReservation, by: string, note: string): Promise<void> {
  if (reservation.lines.length === 0) return;
  await db.runTransaction(async (tx) => {
    const reads = await readStock(tx, db, reservation.lines);
    applyStock(tx, db, reads, reservation.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, delta: l.qty })), { reason: 'ONLINE_RELEASE', ref: { type: 'order', id: orderId }, by, note });
  });
}

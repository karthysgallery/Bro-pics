import { describe, it, expect, beforeAll } from 'vitest';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { applyStock, readStock, releaseOrderStock, reserveOrderStock } from './stock';

// Real Firestore transactions (the emulator), because concurrency is the point.
// Run: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx vitest run src/inventory
const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

describe.skipIf(!enabled)('shared stock (Firestore emulator)', () => {
  let db: Firestore;
  const line = { productId: 'stock_p', variantId: 'stock_v' };
  beforeAll(() => {
    const app = getApps()[0] ?? initializeApp({ projectId: 'demo-bropics' });
    db = getFirestore(app);
  });
  const setStock = (qty: number, trackStock = true) =>
    db.collection('products').doc(line.productId).collection('variants').doc(line.variantId).set({ sku: 'A4-BLK', sizeLabel: 'A4', trackStock, stockQty: qty, stockStatus: 'in_stock' });
  const stockNow = async () => (await db.collection('products').doc(line.productId).collection('variants').doc(line.variantId).get()).data()!;
  const posSale = (qty: number, id: string) =>
    db.runTransaction(async (tx) => {
      const reads = await readStock(tx, db, [line]);
      applyStock(tx, db, reads, [{ ...line, delta: -qty }], { reason: 'OFFLINE_POS', ref: { type: 'pos_sale', id }, by: 'staff' });
    });

  it('never sells more than is on hand when online and in-store sales race', async () => {
    await setStock(3);
    const attempts = Array.from({ length: 10 }, (_, i) =>
      i % 2 === 0 ? posSale(1, `race_pos_${i}`) : reserveOrderStock(db, `race_order_${i}`, 'u1', [{ ...line, qty: 1, title: 'A4 Black Frame' }])
    );
    const results = await Promise.allSettled(attempts);
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBe(3);
    expect(results.filter((r) => r.status === 'rejected').every((r) => /Only 0 left/.test(String((r as PromiseRejectedResult).reason)))).toBe(true);
    expect(await stockNow()).toMatchObject({ stockQty: 0, stockStatus: 'out_of_stock' });
    const moves = await db.collection('inventoryMovements').where('variantId', '==', 'stock_v').get();
    expect(moves.docs.filter((d) => (d.data().ref.id as string).startsWith('race_')).length).toBe(3);
  });

  it('20 → 17 after a POS sale of 3, then a cancelled online order gives its units back exactly once', async () => {
    await setStock(20);
    await posSale(3, 'pos_A4');
    expect((await stockNow()).stockQty).toBe(17);
    const reservation = await reserveOrderStock(db, 'order_rel', 'u1', [{ ...line, qty: 2, title: 'A4 Black Frame' }]);
    expect(reservation).toMatchObject({ status: 'held', lines: [{ qty: 2 }] });
    await db.collection('orders').doc('order_rel').set({ status: 'cancelled', stockReservation: reservation });
    expect((await stockNow()).stockQty).toBe(15);
    const [a, b] = await Promise.all([releaseOrderStock(db, 'order_rel', 'system', 'cancelled'), releaseOrderStock(db, 'order_rel', 'system', 'cancelled')]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect((await stockNow()).stockQty).toBe(17);
  });

  it('leaves made-to-order variants alone', async () => {
    await setStock(0, false);
    expect(await reserveOrderStock(db, 'order_mto', 'u1', [{ ...line, qty: 5, title: 'Frame' }])).toBeNull();
    await posSale(5, 'pos_mto');
    expect((await stockNow()).stockQty).toBe(0);
  });
});

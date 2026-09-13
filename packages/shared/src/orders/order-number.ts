export interface CounterDocRef {
  readonly path: string;
}

export interface CounterTransaction {
  get(ref: CounterDocRef): Promise<{ exists: boolean; data(): { value: number } | undefined }>;
  set(ref: CounterDocRef, data: { value: number }): void;
}

const COUNTER_REF: CounterDocRef = { path: 'counters/orderSeq' };

export async function generateOrderNo(tx: CounterTransaction, year: number): Promise<string> {
  const snapshot = await tx.get(COUNTER_REF);
  const currentValue = snapshot.exists ? snapshot.data()!.value : 0;
  const nextValue = currentValue + 1;
  tx.set(COUNTER_REF, { value: nextValue });
  const padded = String(nextValue).padStart(5, '0');
  return `BP-${year}-${padded}`;
}

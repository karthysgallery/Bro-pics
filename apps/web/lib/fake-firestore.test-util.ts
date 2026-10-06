// A tiny in-memory stand-in for the slice of the Admin Firestore API the personalization
// store uses (collection/doc/get/set, subcollections, transactions). Test-only.
type Data = Record<string, unknown>;

export function createFakeFirestore() {
  const store = new Map<string, Data>();
  const clone = (d: Data) => JSON.parse(JSON.stringify(d)) as Data;

  const docRef = (path: string): any => ({
    path,
    id: path.split('/').pop(),
    async get() {
      const d = store.get(path);
      return { exists: d !== undefined, id: path.split('/').pop(), data: () => (d ? clone(d) : undefined), ref: docRef(path) };
    },
    async set(data: Data) { store.set(path, clone(data)); },
    async update(data: Data) { store.set(path, { ...(store.get(path) ?? {}), ...clone(data) }); },
    collection: (name: string) => collectionRef(`${path}/${name}`),
  });

  const collectionRef = (path: string): any => ({
    path,
    doc: (id: string) => docRef(`${path}/${id}`),
    async get() {
      const depth = path.split('/').length + 1;
      const docs = [...store.entries()]
        .filter(([p]) => p.startsWith(`${path}/`) && p.split('/').length === depth)
        .map(([p, d]) => ({ id: p.split('/').pop()!, exists: true, data: () => clone(d) }));
      return { docs, empty: docs.length === 0, size: docs.length };
    },
  });

  const db: any = {
    collection: (name: string) => collectionRef(name),
    async runTransaction(fn: (tx: any) => Promise<unknown>) {
      const writes: Array<() => void> = [];
      const tx = {
        // Like real Firestore: every read must come before the first write.
        get: (ref: any) => {
          if (writes.length > 0) throw new Error('Firestore transactions require all reads to be executed before all writes.');
          return ref.get();
        },
        set: (ref: any, data: Data) => { writes.push(() => store.set(ref.path, clone(data))); },
        update: (ref: any, data: Data) => { writes.push(() => store.set(ref.path, { ...(store.get(ref.path) ?? {}), ...clone(data) })); },
      };
      const result = await fn(tx);
      writes.forEach((w) => w()); // commit only if fn didn't throw
      return result;
    },
  };
  return { db, store, seed: (path: string, data: Data) => store.set(path, clone(data)) };
}

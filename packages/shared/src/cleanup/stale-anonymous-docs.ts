export interface DocForCleanup {
  id: string;
  userId?: string;
  createdAt?: Date;
}

/**
 * [BE-35] A session-only (no userId) upload or customization older than
 * the threshold represents an anonymous editing session that never
 * reconciled to an account (reconcileSessionOnLogin, Phase 4 Plan A) and
 * never turned into an order — safe to delete. Requires createdAt to be
 * present (see Upload.createdAt / Customization.createdAt's own doc
 * comments): a doc written before that field existed is simply never a
 * cleanup candidate, not treated as infinitely stale or immediately
 * eligible — either guess would be wrong in a different way.
 */
export function findStaleAnonymousDocs(docs: DocForCleanup[], now: Date, thresholdDays = 30): string[] {
  const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
  return docs
    .filter((doc) => !doc.userId && doc.createdAt !== undefined && now.getTime() - doc.createdAt.getTime() > thresholdMs)
    .map((doc) => doc.id);
}

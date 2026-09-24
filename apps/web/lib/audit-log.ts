import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';

/**
 * [ABE-03] `auditLogs` — one doc per admin/staff write, so "who did what,
 * when" is answerable for every sensitive action (role grants, order
 * transitions, refunds, review moderation) without reconstructing it from
 * scattered orders/{id}/events and returns/{id}/events subcollections,
 * which only record domain history, not the ACTOR's identity trail across
 * different resource types. Admin-SDK-only, same as printJobs/
 * notificationOutbox/staff — never read or written by a client directly.
 */
export interface AuditLogEntry {
  actorUid: string;
  action: string;
  resource: string;
  resourceId: string;
  details?: Record<string, unknown>;
}

export async function writeAuditLog(db: Firestore, entry: AuditLogEntry): Promise<void> {
  const ref = db.collection('auditLogs').doc();
  await ref.set({
    id: ref.id,
    actorUid: entry.actorUid,
    action: entry.action,
    resource: entry.resource,
    resourceId: entry.resourceId,
    ...(entry.details && { details: entry.details }),
    createdAt: new Date().toISOString(),
  });
}

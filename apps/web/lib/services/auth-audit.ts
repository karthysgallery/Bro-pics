import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../firebase-admin';

export type AuthAuditEvent =
  | 'otp_requested'
  | 'otp_verified'
  | 'otp_failed'
  | 'otp_expired'
  | 'otp_resend'
  | 'login_success'
  | 'login_failed'
  | 'account_created'
  | 'account_disabled'
  | 'password_changed';

export interface AuthAuditLog {
  id: string;
  userId?: string;
  event: AuthAuditEvent;
  phoneNumberMasked: string;
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}

/**
 * In-memory buffer for audit logs so tests and environments without
 * Firestore write access can still inspect and record security events.
 */
const inMemoryAuditLogs: AuthAuditLog[] = [];

/**
 * Logs a customer authentication security event.
 * Writes to Firestore collection `auth_audit_logs` and retains in-memory record.
 */
export async function logAuthEvent(params: {
  event: AuthAuditEvent;
  phoneNumberMasked: string;
  userId?: string;
  request?: Request;
  details?: Record<string, unknown>;
}): Promise<AuthAuditLog> {
  let ipAddress = 'unknown';
  let userAgent = 'unknown';

  if (params.request) {
    ipAddress =
      params.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      params.request.headers.get('x-real-ip') ||
      'unknown';
    userAgent = params.request.headers.get('user-agent') || 'unknown';
  }

  const logEntry: AuthAuditLog = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    userId: params.userId,
    event: params.event,
    phoneNumberMasked: params.phoneNumberMasked,
    timestamp: new Date().toISOString(),
    ipAddress,
    userAgent,
    details: params.details,
  };

  inMemoryAuditLogs.push(logEntry);
  if (inMemoryAuditLogs.length > 500) {
    inMemoryAuditLogs.shift();
  }

  // Best-effort Firestore write
  try {
    const db = getFirestore(getAdminApp());
    await db.collection('auth_audit_logs').doc(logEntry.id).set(logEntry);
  } catch (err) {
    // Non-blocking in dev/mock/testing when Firestore is offline or uninitialized
  }

  return logEntry;
}

export function getRecentAuthAuditLogs(): AuthAuditLog[] {
  return [...inMemoryAuditLogs];
}

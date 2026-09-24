import { NextResponse } from 'next/server';
import { logger } from '@bro-pics/shared';

export type ApiErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'invalid_request'
  | 'conflict'
  | 'rate_limited'
  | 'internal';

/**
 * [ABE-03] The standard error shape for admin write endpoints:
 * `{ error: { code, message, details, requestId } }`. Forward-only — the
 * 9 existing routes migrated in ABE-02 keep their plain `{ error: string }`
 * shape (their one real consumer, app/admin/roles/page.tsx, only checks
 * `response.ok` and never reads the body's error shape, so there's nothing
 * to retrofit for; changing a working, tested contract with no reader
 * would be pure churn). New admin write endpoints from ABE-04 onward use
 * this from the start. Every call also logs through `logger` on the same
 * requestId, so a requestId that reaches a client error message can always
 * be found in the logs — a requestId that appears in no log line is
 * useless for support/debugging.
 */
export function adminApiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>
): NextResponse {
  const requestId = crypto.randomUUID();
  logger.warn('Admin API error response', { requestId, code, status, message, ...(details && { details }) });
  return NextResponse.json({ error: { code, message, ...(details && { details }), requestId } }, { status });
}

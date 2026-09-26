/**
 * [BE-36] Structured JSON logging for server paths (Next.js API routes,
 * Cloud Functions, the print-render service) — replaces bare console.*
 * calls with a consistent {level, message, ...context} shape a real log
 * aggregator (Cloud Logging, on Firebase App Hosting) can filter and
 * query on, instead of parsing free-text strings. Deliberately thin:
 * this writes to console.log/console.error itself (Cloud Logging already
 * ingests stdout/stderr as structured JSON when the payload IS JSON — no
 * SDK or external account needed for that part). Lives here (not
 * apps/web/lib) so functions/ and services/print-render can share it —
 * it has zero Node/browser-only dependencies (just console/JSON/Date),
 * so unlike print-jobs.ts it's safe in the main barrel and won't repeat
 * BE-34's client-bundle mistake. What's NOT built: alerting on webhook/
 * render/notification failures, the 5xx rate, or reconciliation
 * mismatches — that needs a real alerting channel (email/Slack/
 * PagerDuty), same external-account-blocked bucket as this pass's other
 * logged gaps. A structured log is the artifact an alerting rule would
 * later be built on top of.
 */
export interface LogContext {
  requestId?: string;
  uid?: string;
  orderId?: string;
  [key: string]: unknown;
}

// Keys whose values are redacted wholesale before logging — never partial
// masking (e.g. "j***@x.com"), which still leaks enough to be useful to
// an attacker with log access and is easy to get subtly wrong. A key is
// matched case-insensitively against this list, not against a value
// shape (regex-sniffing "looks like an email" is unreliable and
// expensive); callers are expected to name PII fields obviously (email,
// phone, address, etc.) rather than bury them under a generic key.
const PII_KEYS = new Set([
  'email',
  'phone',
  'phonenumber',
  'address',
  'addressjson',
  'line1',
  'line2',
  'pincode',
  'dob',
  'gstin',
  'razorpaypaymentid',
  'razorpayorderid',
  'idtoken',
  'authorization',
]);

export function scrubPii<T extends Record<string, unknown>>(context: T): T {
  const scrubbed = { ...context };
  for (const key of Object.keys(scrubbed)) {
    if (PII_KEYS.has(key.toLowerCase())) {
      (scrubbed as Record<string, unknown>)[key] = '[REDACTED]';
    }
  }
  return scrubbed;
}

function write(level: 'info' | 'warn' | 'error', message: string, context?: LogContext): void {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(context && scrubPii(context)),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, context?: LogContext) => write('info', message, context),
  warn: (message: string, context?: LogContext) => write('warn', message, context),
  error: (message: string, context?: LogContext) => write('error', message, context),
};

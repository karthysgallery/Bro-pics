import 'server-only';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { NextResponse } from 'next/server';
import { BillingError, roleHasPermission, type PermissionKey, type Role } from '@bro-pics/shared';
import { createWhatsAppService, transportFromEnv, type WhatsAppService } from '@bro-pics/shared/src/whatsapp/service';
import type { FinishDeps } from '@bro-pics/shared/src/billing/invoice-service';
import { getAdminApp } from '../firebase-admin';
import { getPermissionContext } from '../require-permission';
import { adminApiError } from '../admin-api-error';
import { checkRateLimit } from '../rate-limit';

/**
 * Shared wiring for every billing / WhatsApp route on the website: the same
 * database, invoice bucket and WhatsApp service the online-order function
 * uses. WhatsApp credentials are read from the server environment only.
 */

let whatsapp: WhatsAppService | null = null;

export function billingDb(): Firestore {
  return getFirestore(getAdminApp());
}

export function whatsappService(): WhatsAppService {
  if (!whatsapp) whatsapp = createWhatsAppService({ db: billingDb(), transport: transportFromEnv() });
  return whatsapp;
}

export function finishDeps(): FinishDeps {
  return { db: billingDb(), bucket: getStorage(getAdminApp()).bucket(), whatsapp: whatsappService() };
}

/** BillingError → a clear 409/400 for the till; anything else is rethrown (500). */
export function billingErrorResponse(err: unknown): NextResponse {
  if (err instanceof BillingError) {
    const status = err.code === 'insufficient_stock' || err.code === 'unavailable' ? 409 : 400;
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status });
  }
  if (err instanceof Error && /valid 10-digit Indian mobile/.test(err.message)) {
    return NextResponse.json({ error: { code: 'invalid_phone', message: err.message } }, { status: 400 });
  }
  throw err;
}

/** For tests. */
export function resetWhatsAppServiceForTests(): void {
  whatsapp = null;
}


export type BillingGuard = { ok: true; uid: string; role: Role; can: (key: PermissionKey) => boolean } | { ok: false; response: NextResponse };

/** Rate limit + the permission for this route; also says what else this user may do. */
export async function guard(request: Request, key: PermissionKey): Promise<BillingGuard> {
  const rate = checkRateLimit(request, 'staff');
  if (!rate.allowed) return { ok: false, response: NextResponse.json({ error: 'Too many requests, please try again shortly' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }) };
  const ctx = await getPermissionContext(request);
  if (!ctx.authenticated) return { ok: false, response: adminApiError(401, 'unauthenticated', 'Sign in again to continue') };
  if (!ctx.role || !roleHasPermission(ctx.role, key)) return { ok: false, response: adminApiError(403, 'forbidden', 'You do not have access to this part of billing') };
  const role = ctx.role;
  return { ok: true, uid: ctx.uid, role, can: (k) => roleHasPermission(role, k) };
}

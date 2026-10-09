import { NextResponse } from 'next/server';
import { requirePermission } from '../../../../lib/require-permission';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { adminApiError } from '../../../../lib/admin-api-error';
import { getRunningCosts } from '../../../../lib/running-costs';

/**
 * GET /api/admin/running-costs — what the website costs to run (Google
 * Cloud / Firebase). Owner and admins only: it is the business's own bill.
 * `?fresh=1` skips the one-hour cache.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests, please try again shortly' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } });
  }
  const permission = await requirePermission(request, 'audit:read');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Only the owner and admins can see running costs');
  }
  const fresh = new URL(request.url).searchParams.get('fresh') === '1';
  const costs = await getRunningCosts({ fresh });
  return NextResponse.json(costs, { status: 200, headers: { 'Cache-Control': 'private, no-store' } });
}

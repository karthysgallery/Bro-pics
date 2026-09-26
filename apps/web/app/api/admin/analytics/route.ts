import { NextResponse } from 'next/server';
import { requirePermission } from '../../../../lib/require-permission';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { adminApiError } from '../../../../lib/admin-api-error';
import { GET as getDomainAnalytics } from './[domain]/route';

const VALID_DOMAINS = [
  'sales',
  'products',
  'customers',
  'marketing',
  'personalization',
  'funnel',
  'operations',
] as const;

/**
 * [ABE-30 / ANL-06/07] Main Analytics Route
 * Supports ?type=sales|products|... or returns overview index of available domains.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const permission = await requirePermission(request, 'analytics:read');
  if (!permission.ok) {
    return adminApiError(
      permission.status,
      permission.status === 401 ? 'unauthenticated' : 'forbidden',
      'Staff access required'
    );
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type');

  if (type) {
    if (!VALID_DOMAINS.includes(type as any)) {
      return adminApiError(
        400,
        'invalid_request',
        `Invalid analytics type: ${type}. Must be one of: ${VALID_DOMAINS.join(', ')}`
      );
    }
    return getDomainAnalytics(request, { params: Promise.resolve({ domain: type }) });
  }

  return NextResponse.json(
    {
      domains: VALID_DOMAINS,
      links: VALID_DOMAINS.map((d) => `/api/admin/analytics/${d}`),
    },
    { status: 200 }
  );
}

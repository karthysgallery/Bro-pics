import type { NextResponse } from 'next/server';
import { sessionWithoutProof } from '../../../../../lib/security/admin-mfa';
import { withSession } from '../../../../../lib/security/mfa-route';

/** Ends the admin's verified state in this browser (part of signing out). */
export async function POST(request: Request): Promise<NextResponse> {
  return withSession({ ok: true }, sessionWithoutProof(request));
}

import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from '../../../../lib/firebase-admin';

export async function POST(): Promise<NextResponse> {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  try {
    const customToken = await getAuth(getAdminApp()).createCustomToken('test_admin_uid', {
      role: 'super_admin',
      staff: true,
      phone_number: '+919999999999',
    });

    return NextResponse.json({ customToken });
  } catch (err: unknown) {
    console.error('Failed to create dev admin token:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

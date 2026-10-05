import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '../../../../lib/services/session';
import { UserStore } from '../../../../lib/services/user-store';

export async function GET(request: Request): Promise<NextResponse> {
  const session = getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
  }

  const user = await UserStore.findById(session.userId);
  if (!user || user.status === 'disabled') {
    return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
  }

  return NextResponse.json(
    {
      authenticated: true,
      user: {
        id: user.id,
        phone: user.phone,
        displayName: user.displayName,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        whatsappVerified: user.whatsappVerified,
        status: user.status,
      },
    },
    { status: 200 }
  );
}

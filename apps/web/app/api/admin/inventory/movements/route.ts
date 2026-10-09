import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import type { InventoryMovement } from '@bro-pics/shared';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { adminApiError } from '../../../../../lib/admin-api-error';

/** GET /api/admin/inventory/movements?variantId=… — the latest stock changes, newest first. */
export async function GET(request: Request): Promise<NextResponse> {
  const permission = await requirePermission(request, 'catalogue:read');
  if (!permission.ok) return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Catalogue access required');
  const variantId = new URL(request.url).searchParams.get('variantId');
  const db = getFirestore(getAdminApp());
  // Equality filter only (no composite index); sorted here.
  const snap = variantId && /^[A-Za-z0-9_-]{1,128}$/.test(variantId)
    ? await db.collection('inventoryMovements').where('variantId', '==', variantId).limit(200).get()
    : await db.collection('inventoryMovements').orderBy('at', 'desc').limit(100).get();
  const movements = snap.docs.map((d) => d.data() as InventoryMovement).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100);
  return NextResponse.json({ movements }, { status: 200 });
}

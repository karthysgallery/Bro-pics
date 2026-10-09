import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ConsentStatusSchema, consent, type Customer, type Invoice } from '@bro-pics/shared';
import { billingDb, guard } from '../../../../../../lib/billing/server';
import { writeAuditLog } from '../../../../../../lib/audit-log';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET — the customer's profile: online orders and in-store purchases (their invoices), totals and consent. */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const g = await guard(request, 'billing:view');
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!/^p\d{8,15}$/.test(id)) return NextResponse.json({ error: 'Invalid customer id' }, { status: 400 });
  const db = billingDb();
  const snap = await db.collection('customers').doc(id).get();
  if (!snap.exists) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  const invoices = (await db.collection('invoices').where('customerId', '==', id).limit(200).get()).docs.map((d) => d.data() as Invoice).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  return NextResponse.json({ customer: snap.data() as Customer, invoices }, { status: 200 });
}

const PatchSchema = z
  .object({
    transactional: ConsentStatusSchema.optional(),
    marketing: ConsentStatusSchema.optional(),
    /** Where the customer told us: in store, by phone, in writing… */
    source: z.string().trim().min(2).max(60),
  })
  .strict();

/** PATCH — record a consent change (opt-outs apply immediately to every send). */
export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const g = await guard(request, 'billing:create');
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!/^p\d{8,15}$/.test(id)) return NextResponse.json({ error: 'Invalid customer id' }, { status: 400 });
  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const db = billingDb();
  const ref = db.collection('customers').doc(id);
  if (!(await ref.get()).exists) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  const at = new Date().toISOString();
  const update: Record<string, unknown> = { updatedAt: at };
  if (parsed.data.transactional) update['consent.transactional'] = consent(parsed.data.transactional, `staff:${parsed.data.source}`, at);
  if (parsed.data.marketing) update['consent.marketing'] = consent(parsed.data.marketing, `staff:${parsed.data.source}`, at);
  await ref.update(update);
  await writeAuditLog(db, { actorUid: g.uid, action: 'customer.consent_updated', resource: 'customer', resourceId: id, details: parsed.data }).catch(() => undefined);
  return NextResponse.json({ customer: (await ref.get()).data() as Customer }, { status: 200 });
}

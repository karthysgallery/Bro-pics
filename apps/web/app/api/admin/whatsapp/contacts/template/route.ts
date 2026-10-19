import { NextResponse } from 'next/server';
import { templateCsv } from '@bro-pics/shared';
import { guard } from '../../../../../../lib/billing/server';

/** The CSV template for importing contacts (two fake example rows). */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, 'whatsapp:contacts_import');
  if (!g.ok) return g.response;
  return new NextResponse(templateCsv(), { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="karthys-contacts-template.csv"', 'Cache-Control': 'no-store' } });
}

import { NextResponse } from 'next/server';
import { describeTemplates, loadTemplates, recordTemplate, validateTemplateInput } from '@bro-pics/shared/src/whatsapp/template-registry';
import { billingDb, guard } from '../../../../../lib/billing/server';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';

/**
 * GET — the templates the shop sends (name, category, variables, what each is for) with the status an administrator last
 * recorded, plus every recorded marketing template. Template NAMES are shown, never credentials.
 * PUT { name, language, category, status, note? } — record what WhatsApp Manager shows. The code cannot ask Meta; this
 * record is what stops a campaign from using a template nobody has confirmed. Permission: whatsapp:templates_manage.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, 'whatsapp:logs');
  if (!g.ok) return g.response;
  const records = await loadTemplates(billingDb());
  return NextResponse.json({ templates: describeTemplates(records), recorded: records }, { status: 200 });
}

export async function PUT(request: Request): Promise<NextResponse> {
  const g = await guard(request, 'whatsapp:templates_manage');
  if (!g.ok) return g.response;
  const parsed = validateTemplateInput(((await request.json().catch(() => ({}))) ?? {}) as { name: unknown; language: unknown; category: unknown; status: unknown; note?: unknown });
  if (!parsed.ok) return adminApiError(400, 'invalid_request', parsed.message);
  const db = billingDb();
  const rec = await recordTemplate(db, parsed.value, g.uid, new Date().toISOString());
  await writeAuditLog(db, { actorUid: g.uid, action: 'whatsapp.template_recorded', resource: 'whatsappTemplate', resourceId: rec.id, details: { status: rec.status, category: rec.category } }).catch(() => undefined);
  return NextResponse.json({ template: rec }, { status: 200 });
}

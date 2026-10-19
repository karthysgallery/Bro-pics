import type { Firestore } from 'firebase-admin/firestore';
import { META_CATEGORIES, TEMPLATE_NAME, TEMPLATE_STATUSES, TEMPLATE_SPECS, templateNameFor, type MetaCategory, type TemplateStatus } from './templates';

/**
 * What an administrator has recorded about each template after checking WhatsApp Manager. The code cannot ask Meta, so
 * "approved" here means "a named person looked at WhatsApp Manager and saw Approved, on this date". A marketing campaign
 * refuses to send with a template that has no such record. Server-only.
 */

export const TEMPLATES = 'whatsappTemplates';

export interface TemplateRecord {
  id: string;
  name: string;
  language: string;
  category: MetaCategory;
  status: TemplateStatus;
  /** When the administrator last looked at WhatsApp Manager. */
  verifiedAt: string;
  verifiedBy: string;
  note: string | null;
}

export const templateDocId = (name: string, language: string) => `${name}__${language}`;

export function validateTemplateInput(input: { name: unknown; language: unknown; category: unknown; status: unknown; note?: unknown }): { ok: true; value: Omit<TemplateRecord, 'id' | 'verifiedAt' | 'verifiedBy'> } | { ok: false; message: string } {
  if (typeof input.name !== 'string' || !TEMPLATE_NAME.test(input.name)) return { ok: false, message: 'The template name must be lowercase letters, numbers and underscores, exactly as in WhatsApp Manager.' };
  if (typeof input.language !== 'string' || !/^[a-z]{2}(_[A-Z]{2})?$/.test(input.language)) return { ok: false, message: 'Language looks like en or en_US.' };
  if (!META_CATEGORIES.includes(input.category as MetaCategory)) return { ok: false, message: 'Category must be UTILITY, MARKETING or AUTHENTICATION.' };
  if (!TEMPLATE_STATUSES.includes(input.status as TemplateStatus)) return { ok: false, message: 'Unknown status.' };
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 300) : null;
  return { ok: true, value: { name: input.name, language: input.language, category: input.category as MetaCategory, status: input.status as TemplateStatus, note } };
}

export async function recordTemplate(db: Firestore, input: Omit<TemplateRecord, 'id' | 'verifiedAt' | 'verifiedBy'>, actorUid: string, nowIso: string): Promise<TemplateRecord> {
  const id = templateDocId(input.name, input.language);
  const rec: TemplateRecord = { ...input, id, verifiedAt: nowIso, verifiedBy: actorUid };
  await db.collection(TEMPLATES).doc(id).set(rec);
  return rec;
}

export async function loadTemplates(db: Firestore): Promise<TemplateRecord[]> {
  const snap = await db.collection(TEMPLATES).get();
  return snap.docs.map((d) => d.data() as TemplateRecord);
}

/** Why a template may not be used for a marketing send, or null when it may. */
export async function marketingTemplateProblem(db: Firestore, name: string, language: string): Promise<string | null> {
  const snap = await db.collection(TEMPLATES).doc(templateDocId(name, language)).get();
  if (!snap.exists) return `The template "${name}" (${language}) has not been recorded as approved. Check WhatsApp Manager, then record its status on the Templates screen.`;
  const t = snap.data() as TemplateRecord;
  if (t.category !== 'MARKETING') return `The template "${name}" is recorded as ${t.category}, not MARKETING. Offers must use a MARKETING template.`;
  if (t.status !== 'approved') return `The template "${name}" is recorded as ${t.status}. It must be approved by Meta before it can be sent.`;
  return null;
}

/** The templates the code sends, with the recorded status of each (or "not recorded"). */
export function describeTemplates(records: TemplateRecord[], env: Record<string, string | undefined> = process.env) {
  return TEMPLATE_SPECS.map((spec) => {
    const name = templateNameFor(spec.key, env);
    const rec = records.find((r) => r.name === name);
    return { ...spec, name, recorded: rec ? { status: rec.status, language: rec.language, category: rec.category, verifiedAt: rec.verifiedAt, verifiedBy: rec.verifiedBy, note: rec.note } : null, categoryMatches: rec ? rec.category === spec.category : null };
  });
}

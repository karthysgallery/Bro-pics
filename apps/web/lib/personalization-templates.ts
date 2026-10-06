import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import {
  PersonalizationTemplateSchema,
  assertPublishable,
  canTransitionStatus,
  latestPublished,
  nextDraftVersion,
  validateTemplate,
  type PersonalizationTemplate,
  type TemplateStatus,
  type ValidateOptions,
} from '@bro-pics/shared';

/**
 * Storage for v2 personalization templates:
 *   personalizationTemplates/{templateId}                      summary (for the admin list)
 *   personalizationTemplates/{templateId}/versions/{version}   the full template at that version
 * A version is immutable once published (only archiving is allowed afterwards);
 * every edit of a published design is a NEW draft version, so an order that
 * pinned (templateId, version) always finds exactly what the customer bought.
 */
const ROOT = 'personalizationTemplates';

export class TemplateNotFoundError extends Error {}
export class TemplateStateError extends Error {}

/** Firestore rejects `undefined`; a JSON round trip drops it and keeps everything else. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function versionRef(db: Firestore, id: string, version: number) {
  return db.collection(ROOT).doc(id).collection('versions').doc(String(version));
}

export async function listVersions(db: Firestore, id: string): Promise<PersonalizationTemplate[]> {
  const snap = await db.collection(ROOT).doc(id).collection('versions').get();
  return snap.docs.map((d) => PersonalizationTemplateSchema.parse(d.data()));
}

export async function getTemplateVersion(db: Firestore, id: string, version: number): Promise<PersonalizationTemplate | null> {
  const snap = await versionRef(db, id, version).get();
  return snap.exists ? PersonalizationTemplateSchema.parse(snap.data()) : null;
}

/** What a customer starting a NEW personalization gets: the newest PUBLISHED version only. */
export async function getLatestPublished(db: Firestore, id: string): Promise<PersonalizationTemplate | null> {
  return latestPublished(await listVersions(db, id), id);
}

export interface TemplateSummary {
  id: string;
  name: string;
  type: PersonalizationTemplate['type'];
  latestVersion: number;
  latestStatus: TemplateStatus;
  publishedVersion: number | null;
  updatedAt: string;
}

export async function listTemplateSummaries(db: Firestore): Promise<TemplateSummary[]> {
  const snap = await db.collection(ROOT).get();
  return snap.docs.map((d) => d.data() as TemplateSummary).sort((a, b) => a.name.localeCompare(b.name));
}

async function writeSummary(db: Firestore, tx: FirebaseFirestore.Transaction | null, id: string, versions: PersonalizationTemplate[], now: Date) {
  const latest = versions.reduce((best, t) => (t.version > best.version ? t : best));
  const published = latestPublished(versions, id);
  const summary: TemplateSummary = {
    id,
    name: latest.name,
    type: latest.type,
    latestVersion: latest.version,
    latestStatus: latest.status,
    publishedVersion: published?.version ?? null,
    updatedAt: now.toISOString(),
  };
  const ref = db.collection(ROOT).doc(id);
  if (tx) tx.set(ref, summary);
  else await ref.set(summary);
}

/**
 * Creates a draft. For a brand-new id it is version 1; for an existing id it is the
 * next version, copied from `base` (so "edit a published template" = new draft).
 * Never touches an existing version doc.
 */
export async function createDraft(
  db: Firestore,
  template: unknown,
  now: Date = new Date()
): Promise<PersonalizationTemplate> {
  const base = validateTemplate(template);
  if (!base.template) throw new TemplateStateError(base.issues.map((i) => i.message).join('; '));
  const parsedTemplate: PersonalizationTemplate = base.template;
  const id = parsedTemplate.id;

  return db.runTransaction(async (tx) => {
    const versionsSnap = await tx.get(db.collection(ROOT).doc(id).collection('versions'));
    const existing = versionsSnap.docs.map((d) => PersonalizationTemplateSchema.parse(d.data()));
    const draft: PersonalizationTemplate =
      existing.length === 0
        ? { ...parsedTemplate, version: 1, status: 'draft', createdAt: now.toISOString(), publishedAt: undefined }
        : { ...nextDraftVersion(existing, parsedTemplate), createdAt: now.toISOString() };
    tx.set(versionRef(db, id, draft.version), plain(draft));
    await writeSummary(db, tx, id, [...existing, draft], now);
    return draft;
  });
}

/** Overwrites a DRAFT or REVIEW version in place. Published/archived versions are immutable. */
export async function saveDraft(db: Firestore, id: string, version: number, template: unknown, now: Date = new Date()): Promise<PersonalizationTemplate> {
  const parsed = validateTemplate(template);
  if (!parsed.template) throw new TemplateStateError(parsed.issues.map((i) => i.message).join('; '));
  const parsedTemplate: PersonalizationTemplate = parsed.template;
  if (parsedTemplate.id !== id || parsedTemplate.version !== version) {
    throw new TemplateStateError('Template id/version in the body do not match the URL.');
  }
  return db.runTransaction(async (tx) => {
    const ref = versionRef(db, id, version);
    const current = await tx.get(ref);
    if (!current.exists) throw new TemplateNotFoundError(`${id}@v${version} does not exist`);
    const status = (current.data() as { status: TemplateStatus }).status;
    if (status !== 'draft' && status !== 'review') {
      throw new TemplateStateError(`${id}@v${version} is ${status} and can no longer be edited; create a new version instead.`);
    }
    const next: PersonalizationTemplate = { ...parsedTemplate, status, publishedAt: undefined };
    // Firestore transactions must finish every read before the first write.
    const all = await tx.get(db.collection(ROOT).doc(id).collection('versions'));
    tx.set(ref, plain(next));
    const versions = all.docs.map((d) => (Number(d.id) === version ? next : PersonalizationTemplateSchema.parse(d.data())));
    await writeSummary(db, tx, id, versions, now);
    return next;
  });
}

/**
 * Moves a version along draft → review → published → archived. Publishing runs the
 * FULL publish-time validation (including that referenced assets exist) and refuses
 * a template that could render broken for customers.
 */
export async function transitionStatus(
  db: Firestore,
  id: string,
  version: number,
  to: TemplateStatus,
  options: { validate?: ValidateOptions; now?: Date } = {}
): Promise<PersonalizationTemplate> {
  const now = options.now ?? new Date();
  return db.runTransaction(async (tx) => {
    const ref = versionRef(db, id, version);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new TemplateNotFoundError(`${id}@v${version} does not exist`);
    const current = PersonalizationTemplateSchema.parse(snap.data());
    if (!canTransitionStatus(current.status, to)) {
      throw new TemplateStateError(`Cannot move ${id}@v${version} from ${current.status} to ${to}.`);
    }
    if (to === 'published') assertPublishable(current, options.validate); // throws a readable list
    const next: PersonalizationTemplate = { ...current, status: to, ...(to === 'published' && { publishedAt: now.toISOString() }) };
    const all = await tx.get(db.collection(ROOT).doc(id).collection('versions'));
    tx.set(ref, plain(next));
    const versions = all.docs.map((d) => (Number(d.id) === version ? next : PersonalizationTemplateSchema.parse(d.data())));
    await writeSummary(db, tx, id, versions, now);
    return next;
  });
}

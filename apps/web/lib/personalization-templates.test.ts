import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { createFakeFirestore } from './fake-firestore.test-util';
import {
  createDraft, getLatestPublished, getTemplateVersion, listTemplateSummaries, listVersions, saveDraft,
  transitionStatus, TemplateNotFoundError, TemplateStateError,
} from './personalization-templates';
// Synthetic templates from shared's fixtures.
import { singlePhotoTemplate, threePhotoTemplate } from '@bro-pics/shared/src/personalization/test-fixtures';

const fresh = () => createFakeFirestore().db;
const asDraft = (t: typeof singlePhotoTemplate) => ({ ...t, status: 'draft' as const, version: 1 });

describe('personalization template store', () => {
  it('creates a brand-new template as draft v1, and lists it in the admin summary', async () => {
    const db = fresh();
    const draft = await createDraft(db, asDraft(singlePhotoTemplate));
    expect(draft).toMatchObject({ id: 'single-8x12', version: 1, status: 'draft' });
    const summaries = await listTemplateSummaries(db);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ id: 'single-8x12', latestVersion: 1, latestStatus: 'draft', publishedVersion: null });
  });

  it('rejects structurally invalid templates', async () => {
    await expect(createDraft(fresh(), { id: 'x' })).rejects.toThrow(TemplateStateError);
  });

  it('a DRAFT is invisible to customers; publishing makes it the live version', async () => {
    const db = fresh();
    await createDraft(db, asDraft(singlePhotoTemplate));
    expect(await getLatestPublished(db, 'single-8x12')).toBeNull();
    await transitionStatus(db, 'single-8x12', 1, 'published', { now: new Date('2026-10-05T00:00:00Z') });
    const live = await getLatestPublished(db, 'single-8x12');
    expect(live).toMatchObject({ version: 1, status: 'published', publishedAt: '2026-10-05T00:00:00.000Z' });
    expect((await listTemplateSummaries(db))[0].publishedVersion).toBe(1);
  });

  it('refuses to publish an invalid template with a readable reason', async () => {
    const db = fresh();
    const broken = asDraft(singlePhotoTemplate);
    await createDraft(db, broken);
    // Corrupt the stored draft the way a bad edit could: a slot missing from the layer stack.
    await saveDraft(db, 'single-8x12', 1, { ...broken, layers: broken.layers.filter((l) => l.kind !== 'photoSlot') });
    await expect(transitionStatus(db, 'single-8x12', 1, 'published')).rejects.toThrow(/cannot be published[\s\S]*never be drawn/);
    expect(await getLatestPublished(db, 'single-8x12')).toBeNull();
  });

  it('publish-time validation checks that referenced assets exist', async () => {
    const db = fresh();
    await createDraft(db, asDraft(singlePhotoTemplate));
    await expect(transitionStatus(db, 'single-8x12', 1, 'published', { validate: { assetExists: () => false } })).rejects.toThrow(/missing asset/);
    await expect(transitionStatus(db, 'single-8x12', 1, 'published', { validate: { assetExists: () => true } })).resolves.toMatchObject({ status: 'published' });
  });

  it('a published version is immutable: it cannot be edited or un-published, only archived', async () => {
    const db = fresh();
    await createDraft(db, asDraft(singlePhotoTemplate));
    await transitionStatus(db, 'single-8x12', 1, 'published');
    await expect(saveDraft(db, 'single-8x12', 1, { ...singlePhotoTemplate, name: 'renamed' })).rejects.toThrow(/can no longer be edited/);
    await expect(transitionStatus(db, 'single-8x12', 1, 'draft')).rejects.toThrow(TemplateStateError);
    await expect(transitionStatus(db, 'single-8x12', 1, 'archived')).resolves.toMatchObject({ status: 'archived' });
    await expect(transitionStatus(db, 'single-8x12', 1, 'published')).rejects.toThrow(TemplateStateError);
  });

  it('editing a published design creates a NEW draft version and leaves v1 — and old orders — untouched', async () => {
    const db = fresh();
    await createDraft(db, asDraft(singlePhotoTemplate));
    await transitionStatus(db, 'single-8x12', 1, 'published');

    const edited = { ...singlePhotoTemplate, photoSlots: [{ ...singlePhotoTemplate.photoSlots[0], x: 0.2, width: 0.6 }] };
    const v2 = await createDraft(db, edited);
    expect(v2).toMatchObject({ version: 2, status: 'draft' });

    // Customers still get v1 until v2 is published; v1's geometry is unchanged.
    expect((await getLatestPublished(db, 'single-8x12'))?.version).toBe(1);
    expect((await getTemplateVersion(db, 'single-8x12', 1))?.photoSlots[0].x).toBe(0.1);

    await transitionStatus(db, 'single-8x12', 2, 'published');
    expect((await getLatestPublished(db, 'single-8x12'))?.version).toBe(2);
    // ...and the pinned v1 is still exactly retrievable for an order that bought it.
    expect((await getTemplateVersion(db, 'single-8x12', 1))?.photoSlots[0].x).toBe(0.1);
    expect((await listVersions(db, 'single-8x12')).map((t) => t.version).sort()).toEqual([1, 2]);
  });

  it('editing a draft in place works, and a mismatched id/version is refused', async () => {
    const db = fresh();
    await createDraft(db, asDraft(threePhotoTemplate));
    const saved = await saveDraft(db, 'trio-12x8', 1, { ...threePhotoTemplate, name: 'Trio (renamed)' });
    expect(saved.name).toBe('Trio (renamed)');
    await expect(saveDraft(db, 'trio-12x8', 1, { ...threePhotoTemplate, id: 'other' })).rejects.toThrow(/do not match/);
    await expect(saveDraft(db, 'trio-12x8', 9, { ...threePhotoTemplate, version: 9 })).rejects.toThrow(TemplateNotFoundError);
  });

  it('does not write anything when a transition is refused (transactional)', async () => {
    const db = fresh();
    await createDraft(db, asDraft(singlePhotoTemplate));
    await expect(transitionStatus(db, 'single-8x12', 1, 'archived').then(() => transitionStatus(db, 'single-8x12', 1, 'published'))).rejects.toThrow();
    expect((await getTemplateVersion(db, 'single-8x12', 1))?.status).toBe('archived');
  });
});

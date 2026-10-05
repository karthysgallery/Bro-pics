import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { createFakeFirestore } from './fake-firestore.test-util';
import { buildLineSnapshot, PersonalizationRejectedError } from './personalization-order';
import { singlePhotoTemplate, photoPlusTextTemplate } from '@bro-pics/shared/src/personalization/test-fixtures';
import { createEmptyState, setSlotPhoto, setText, setSlotTransform } from '@bro-pics/shared';

function setup(opts: { status?: 'published' | 'draft'; upload?: Record<string, unknown> } = {}) {
  const fake = createFakeFirestore();
  fake.seed('personalizationTemplates/single-8x12/versions/1', { ...singlePhotoTemplate, status: opts.status ?? 'published' });
  fake.seed('personalizationTemplates/names-8x10/versions/1', { ...photoPlusTextTemplate, status: 'published' });
  fake.seed('uploads/up_1', { userId: 'user_1', status: 'ready', widthPx: 6000, heightPx: 4000, ...opts.upload });
  return fake.db;
}
const claim = (state: unknown, t = singlePhotoTemplate) => ({ templateId: t.id, templateVersion: t.version, state });
const goodState = () => setSlotPhoto(createEmptyState('single-8x12', 1), 'photo_01', { assetId: 'up_1', width: 6000, height: 4000 });
const rejects = async (p: Promise<unknown>, code: string) => {
  const err = (await p.catch((e) => e)) as PersonalizationRejectedError;
  expect(err).toBeInstanceOf(PersonalizationRejectedError);
  expect(err.code).toBe(code);
  return err as PersonalizationRejectedError;
};

describe('buildLineSnapshot (server-side trust boundary for personalization)', () => {
  it('turns a valid claim into a frozen snapshot with the template and state at purchase', async () => {
    const snap = await buildLineSnapshot(setup(), 'user_1', claim(goodState()));
    expect(snap).toMatchObject({ templateId: 'single-8x12', templateVersion: 1 });
    expect(snap.template.id).toBe('single-8x12');
    expect(snap.state.slots.photo_01.assetId).toBe('up_1');
  });

  it('takes photo dimensions from the UPLOAD record, never from the client (cannot fake a sharp DPI)', async () => {
    const lie = setSlotPhoto(createEmptyState('single-8x12', 1), 'photo_01', { assetId: 'up_1', width: 60000, height: 40000 });
    const snap = await buildLineSnapshot(setup({ upload: { widthPx: 6000, heightPx: 4000 } }), 'user_1', claim(lie));
    expect(snap.state.slots.photo_01).toMatchObject({ width: 6000, height: 4000 });
  });

  it('a spoofed resolution cannot rescue a genuinely low-resolution photo', async () => {
    const lie = setSlotPhoto(createEmptyState('single-8x12', 1), 'photo_01', { assetId: 'up_1', width: 9000, height: 9000 });
    const err = await rejects(buildLineSnapshot(setup({ upload: { widthPx: 500, heightPx: 500 } }), 'user_1', claim(lie)), 'incomplete');
    expect(err.details?.join(' ')).toMatch(/too low-resolution/);
  });

  it('drops expiring signed URLs from the stored record', async () => {
    const withUrl = setSlotPhoto(createEmptyState('single-8x12', 1), 'photo_01', { assetId: 'up_1', width: 6000, height: 4000, url: 'https://x/y?sig=1' });
    expect('url' in (await buildLineSnapshot(setup(), 'user_1', claim(withUrl))).state.slots.photo_01).toBe(false);
  });

  it("refuses someone else's photo, a missing photo and a rejected upload", async () => {
    await rejects(buildLineSnapshot(setup({ upload: { userId: 'intruder' } }), 'user_1', claim(goodState())), 'asset_not_owned');
    await rejects(buildLineSnapshot(setup({ upload: { userId: undefined } }), 'user_1', claim(goodState())), 'asset_not_owned'); // never reconciled to an account
    const ghost = setSlotPhoto(createEmptyState('single-8x12', 1), 'photo_01', { assetId: 'nope', width: 10, height: 10 });
    await rejects(buildLineSnapshot(setup(), 'user_1', claim(ghost)), 'asset_not_found');
    await rejects(buildLineSnapshot(setup({ upload: { status: 'rejected' } }), 'user_1', claim(goodState())), 'asset_not_found');
  });

  it('only PUBLISHED templates can be ordered; a missing or unpublished version is refused', async () => {
    await rejects(buildLineSnapshot(setup({ status: 'draft' }), 'user_1', claim(goodState())), 'template_unavailable');
    const wrongVersion = { templateId: 'single-8x12', templateVersion: 7, state: { ...goodState(), templateVersion: 7 } };
    await rejects(buildLineSnapshot(setup(), 'user_1', wrongVersion), 'template_unavailable');
  });

  it('refuses a claim whose state disagrees with its template id/version, or is malformed', async () => {
    await rejects(buildLineSnapshot(setup(), 'user_1', { templateId: 'single-8x12', templateVersion: 1, state: { ...goodState(), templateVersion: 2 } }), 'malformed');
    await rejects(buildLineSnapshot(setup(), 'user_1', claim({ nonsense: true })), 'malformed');
    await rejects(buildLineSnapshot(setup(), 'user_1', claim({ ...goodState(), slots: { photo_01: { assetId: 'up_1', url: 'data:image/png;base64,AAAA', width: 1, height: 1, transform: { scale: 1, offsetX: 0, offsetY: 0 } } } })), 'malformed');
  });

  it('refuses slots and text fields the template does not have', async () => {
    const extra = setSlotPhoto(goodState(), 'photo_99', { assetId: 'up_1', width: 6000, height: 4000 });
    await rejects(buildLineSnapshot(setup(), 'user_1', claim(extra)), 'unknown_slot');
    await rejects(buildLineSnapshot(setup(), 'user_1', claim(setText(goodState(), 'ghost', { value: 'x' }))), 'unknown_slot');
  });

  it('re-checks completeness on the server: an empty required slot cannot be ordered', async () => {
    const err = await rejects(buildLineSnapshot(setup(), 'user_1', claim(createEmptyState('single-8x12', 1))), 'incomplete');
    expect(err.details?.join(' ')).toMatch(/Add a photo/);
  });

  it('requires and bounds text on a photo+text template', async () => {
    const db = setup();
    const t = photoPlusTextTemplate;
    const base = setSlotPhoto(createEmptyState(t.id, 1), 'photo_01', { assetId: 'up_1', width: 6000, height: 4000 });
    await rejects(buildLineSnapshot(db, 'user_1', claim(base, t)), 'incomplete');
    await rejects(buildLineSnapshot(db, 'user_1', claim(setText(base, 'name', { value: 'x'.repeat(60) }), t)), 'incomplete');
    const ok = await buildLineSnapshot(db, 'user_1', claim(setText(base, 'name', { value: 'Asha & Ravi' }), t));
    expect(ok.state.texts.name.value).toBe('Asha & Ravi');
  });

  it('only accepts the design the product actually offers', async () => {
    await rejects(buildLineSnapshot(setup(), 'user_1', claim(goodState()), { offeredTemplateId: 'another-design' }), 'template_not_offered');
    await rejects(buildLineSnapshot(setup(), 'user_1', claim(goodState()), { offeredTemplateId: null }), 'template_not_offered');
    const ok = await buildLineSnapshot(setup(), 'user_1', claim(goodState()), { offeredTemplateId: 'single-8x12' });
    expect(ok.templateId).toBe('single-8x12');
  });

  it('judges sharpness at the frame size bought: a photo fine at 8×12 is refused at 40×60', async () => {
    const small = { upload: { widthPx: 1600, heightPx: 2400 } };
    const state = setSlotPhoto(createEmptyState('single-8x12', 1), 'photo_01', { assetId: 'up_1', width: 1600, height: 2400 });
    await expect(buildLineSnapshot(setup(small), 'user_1', claim(state), { printSizeIn: { width: 8, height: 12 } })).resolves.toBeTruthy();
    const err = await rejects(buildLineSnapshot(setup(small), 'user_1', claim(state), { printSizeIn: { width: 40, height: 60 } }), 'incomplete');
    expect(err.details?.join(' ')).toMatch(/too low-resolution/);
  });

  it('the crop the customer chose survives into the snapshot (and is clamped to keep covering the slot)', async () => {
    const cropped = setSlotTransform(goodState(), 'photo_01', { scale: 1.5, offsetX: 0.05, offsetY: 0 }, 1);
    const snap = await buildLineSnapshot(setup(), 'user_1', claim(cropped));
    expect(snap.state.slots.photo_01.transform.scale).toBe(1.5);
  });
});

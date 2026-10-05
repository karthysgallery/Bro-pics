import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
import { buildOrderSnapshot, createEmptyState, setSlotPhoto } from '@bro-pics/shared';
import { singlePhotoTemplate, threePhotoTemplate } from '@bro-pics/shared/src/personalization/test-fixtures';
import { renderPrintJob, type RenderJobDependencies } from './render-job';

const solid = (r: number, g: number, b: number) => sharp({ create: { width: 300, height: 300, channels: 3, background: { r, g, b } } }).png().toBuffer();

function fakeDeps(snapshot: ReturnType<typeof buildOrderSnapshot> | null, over: Partial<RenderJobDependencies> = {}) {
  const calls = { upload: [] as Array<{ path: string; buffer: Buffer }>, complete: [] as string[], fail: [] as string[], legacyTouched: false };
  const deps: RenderJobDependencies = {
    leaseJob: vi.fn().mockResolvedValue(undefined),
    failJob: vi.fn(async (_id, message) => { calls.fail.push(message); }),
    completeJobAndAdvanceOrder: vi.fn(async (_id, path) => { calls.complete.push(path); }),
    getPrintJob: vi.fn().mockResolvedValue({ orderId: 'o1', itemId: 'i1', personalizationId: 'pz1' }),
    getOrderItem: vi.fn().mockResolvedValue({ variantId: 'v1' }),
    getVariant: vi.fn(async () => { calls.legacyTouched = true; return null; }),
    getCustomizationsForPersonalization: vi.fn(async () => { calls.legacyTouched = true; return []; }),
    getFrameTemplate: vi.fn(async () => { calls.legacyTouched = true; return null; }),
    getUpload: vi.fn(async (id: string) => (id === 'up_1' ? { originalPath: 'upload/u/up_1.jpg' } : null)),
    fetchPublicAsset: vi.fn(),
    downloadPrivateFile: vi.fn(async () => solid(200, 40, 40)),
    uploadPrintFile: vi.fn(async (_o, _i, name, buffer) => { calls.upload.push({ path: name, buffer }); return `print-files/o1/i1/${name}`; }),
    markCustomizationsRendered: vi.fn(),
    markCustomizationsFailed: vi.fn(),
    getOrderItemPersonalization: vi.fn().mockResolvedValue(snapshot),
    loadTemplateAsset: vi.fn(async () => solid(250, 250, 250)),
    ...over,
  };
  return { deps, calls };
}

const snapshotFor = (template: typeof singlePhotoTemplate, assetId = 'up_1') =>
  buildOrderSnapshot(template, setSlotPhoto(createEmptyState(template.id, template.version), 'photo_01', { assetId, width: 300, height: 300 }));

describe('renderPrintJob for template-v2 items', () => {
  it('renders from the frozen snapshot at the template\'s print size and completes the job, touching no legacy data', async () => {
    const { deps, calls } = fakeDeps(snapshotFor(singlePhotoTemplate));
    await renderPrintJob(deps, 'job1');
    expect(calls.legacyTouched).toBe(false);
    expect(calls.complete).toEqual(['print-files/o1/i1/print.png']);
    const meta = await sharp(calls.upload[0].buffer).metadata();
    expect([meta.width, meta.height]).toEqual([singlePhotoTemplate.canvas.width, singlePhotoTemplate.canvas.height]);
    // The slot centre carries the customer's photo (red-ish), not the background.
    const { data, info } = await sharp(calls.upload[0].buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const i = (Math.round(info.height / 2) * info.width + Math.round(info.width / 2)) * 4;
    expect([data[i], data[i + 1], data[i + 2]]).toEqual([200, 40, 40]);
  }, 60_000);

  it('loads customer photos via the upload record and template art via the media library', async () => {
    const { deps } = fakeDeps(snapshotFor(singlePhotoTemplate));
    await renderPrintJob(deps, 'job1');
    expect(deps.getUpload).toHaveBeenCalledWith('up_1');
    expect(deps.downloadPrivateFile).toHaveBeenCalledWith('upload/u/up_1.jpg');
    expect(deps.loadTemplateAsset).toHaveBeenCalledWith('bg-single-8x12');
  }, 60_000);

  it('uses the template version frozen in the snapshot — an old order never renders with a newer template', async () => {
    const snap = snapshotFor(singlePhotoTemplate);
    // Even if the "current" template were different, the job only ever sees the snapshot.
    const { deps } = fakeDeps(snap);
    await renderPrintJob(deps, 'job1');
    expect(deps.getFrameTemplate).not.toHaveBeenCalled();
    expect(snap.templateVersion).toBe(1);
  }, 60_000);

  it('fails the job (so it retries/escalates) when a customer photo cannot be found, naming it', async () => {
    const { deps, calls } = fakeDeps(snapshotFor(singlePhotoTemplate, 'up_missing'));
    await expect(renderPrintJob(deps, 'job1')).rejects.toThrow(/up_missing/);
    expect(calls.fail[0]).toMatch(/up_missing/);
    expect(calls.complete).toEqual([]);
  });

  it('fails the job when a template asset is missing from the media library', async () => {
    const { deps, calls } = fakeDeps(snapshotFor(singlePhotoTemplate), { loadTemplateAsset: vi.fn().mockRejectedValue(new Error('not in the media library')) });
    await expect(renderPrintJob(deps, 'job1')).rejects.toThrow(/bg-single-8x12/);
    expect(calls.complete).toEqual([]);
  });

  it('items WITHOUT a snapshot still take the legacy path (unchanged behaviour)', async () => {
    const { deps, calls } = fakeDeps(null);
    await expect(renderPrintJob(deps, 'job1')).rejects.toThrow(/Variant v1 not found/);
    expect(calls.legacyTouched).toBe(true);
    void threePhotoTemplate;
  });

  it('works for deployments whose deps do not implement the v2 hooks at all', async () => {
    const { deps } = fakeDeps(null, { getOrderItemPersonalization: undefined, loadTemplateAsset: undefined });
    await expect(renderPrintJob(deps, 'job1')).rejects.toThrow(/Variant v1 not found/);
  });
});

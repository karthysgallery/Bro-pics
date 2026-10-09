import { describe, it, expect, vi } from 'vitest';
import { createCutout, CutoutError, type CutoutDependencies, type CutoutUploadRecord } from './cutout-job';

function deps(uploads: Record<string, CutoutUploadRecord>, subjectShare = 0.3) {
  const created: Record<string, unknown>[] = [];
  const saved: string[] = [];
  const links: Array<[string, string]> = [];
  const d: CutoutDependencies = {
    getUpload: async (id) => uploads[id] ?? null,
    download: async () => Buffer.from('jpeg'),
    saveFile: async (path) => {
      saved.push(path);
    },
    newUploadId: () => 'cut_1',
    createUpload: async (r) => {
      created.push(r);
    },
    linkCutout: async (a, b) => {
      links.push([a, b]);
    },
    removeBackground: vi.fn(async () => ({ png: Buffer.from('png'), width: 2400, height: 3600, subjectShare, subjectBox: { x: 0.2, y: 0.3, width: 0.5, height: 0.7 } })),
    now: () => new Date('2026-10-09T00:00:00Z'),
  };
  return { d, created, saved, links };
}

const photo: CutoutUploadRecord = { id: 'up_1', sessionId: 's1', userId: 'u1', originalPath: 'uploads/s1/up_1/original.jpg', widthPx: 2400, heightPx: 3600, status: 'ready' };

describe('createCutout', () => {
  it('stores the cut-out as the customer\'s own upload next to the original and links it', async () => {
    const { d, created, saved, links } = deps({ up_1: photo });
    const result = await createCutout(d, 'up_1');
    expect(result).toEqual({ uploadId: 'cut_1', widthPx: 2400, heightPx: 3600, reused: false, subjectBox: { x: 0.2, y: 0.3, width: 0.5, height: 0.7 } });
    expect(saved).toEqual(['uploads/s1/cut_1/original.png']);
    expect(created[0]).toMatchObject({ id: 'cut_1', sessionId: 's1', userId: 'u1', mime: 'image/png', status: 'ready', cutoutOf: 'up_1', subjectBox: { x: 0.2, y: 0.3, width: 0.5, height: 0.7 } });
    expect(links).toEqual([['up_1', 'cut_1']]);
  });

  it('reuses an earlier cut-out instead of running the model again', async () => {
    const { d } = deps({ up_1: { ...photo, cutoutUploadId: 'cut_0' }, cut_0: { ...photo, id: 'cut_0', cutoutOf: 'up_1' } });
    expect(await createCutout(d, 'up_1')).toMatchObject({ uploadId: 'cut_0', reused: true });
    expect(await createCutout(d, 'cut_0')).toMatchObject({ uploadId: 'cut_0', reused: true });
    expect(d.removeBackground).not.toHaveBeenCalled();
  });

  it('explains a photo with nobody in it, a missing photo and one not ready', async () => {
    await expect(createCutout(deps({ up_1: photo }, 0.001).d, 'up_1')).rejects.toMatchObject({ status: 422, code: 'no_subject' });
    await expect(createCutout(deps({}).d, 'nope')).rejects.toBeInstanceOf(CutoutError);
    await expect(createCutout(deps({ up_1: { ...photo, status: 'rejected' } }).d, 'up_1')).rejects.toMatchObject({ status: 409 });
  });
});

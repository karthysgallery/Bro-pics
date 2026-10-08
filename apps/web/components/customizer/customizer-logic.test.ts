import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CalendarSlotSchema, createEmptyState, setCalendarDate, setSlotPhoto, setText, type PersonalizationTemplate } from '@bro-pics/shared';
import { carryOverState, planPhotoTargets } from './state-carry';
import { clearTemplateDraft, DRAFT_MAX_AGE_MS, loadTemplateDraft, persistableState, saveTemplateDraft } from './draft-store';
import { createTaskQueue, PhotoError, uploadPhoto } from './photo-files';

function template(id: string, slotIds: string[], textIds: string[] = [], version = 1): PersonalizationTemplate {
  return {
    id,
    version,
    status: 'published',
    type: 'collage',
    name: id,
    canvas: { width: 1200, height: 800, dpi: 100, safeInset: 0, bleedMm: 0 },
    photoSlots: slotIds.map((sid, i) => ({ id: sid, label: `Photo ${i + 1}`, required: true, x: 0.1 * i, y: 0.1, width: 0.1, height: 0.3, rotationDeg: 0, shape: 'rect', fit: 'cover' })),
    textSlots: textIds.map((tid) => ({ id: tid, label: tid, required: false, x: 0.1, y: 0.8, width: 0.8, height: 0.1, maxLength: 40, align: 'center', defaultValue: '' })),
    layers: [...slotIds.map((slotId) => ({ kind: 'photoSlot' as const, slotId })), ...textIds.map((slotId) => ({ kind: 'text' as const, slotId }))],
    tags: [],
  };
}

const photo = (assetId: string) => ({ assetId, width: 1000, height: 800 });

describe('carryOverState', () => {
  it('keeps photos, framing and text on a newer version of the same design', () => {
    const v1 = template('wed', ['photo_01', 'photo_02'], ['names']);
    let s = setSlotPhoto(createEmptyState('wed', 1), 'photo_01', photo('a'));
    s = { ...s, slots: { photo_01: { ...s.slots.photo_01, transform: { scale: 2, offsetX: 0.1, offsetY: 0 } } } };
    s = setText(s, 'names', { value: 'Asha & Ravi' });
    const v2 = template('wed', ['photo_01', 'photo_02', 'photo_03'], ['names'], 2);
    const { state, dropped } = carryOverState(s, v2);
    expect(state.templateVersion).toBe(2);
    expect(state.slots.photo_01.transform.scale).toBe(2);
    expect(state.texts.names.value).toBe('Asha & Ravi');
    expect(dropped).toBe(0);
    expect(v1.id).toBe(v2.id);
  });

  it('keeps the chosen calendar date on another version, and drops it where there is no calendar', () => {
    const withCalendar = (version: number) => ({
      ...template('cal', ['photo_01'], [], version),
      calendarSlots: [CalendarSlotSchema.parse({ id: 'calendar_01', label: 'Date', x: 0.1, y: 0.6, width: 0.8, height: 0.3 })],
    });
    const s = setCalendarDate(createEmptyState('cal', 1), 'calendar_01', '2024-05-24');
    expect(carryOverState(s, withCalendar(2)).state.dates).toEqual({ calendar_01: { date: '2024-05-24' } });
    expect(carryOverState(s, template('cal', ['photo_01'], [], 2)).state.dates).toBeUndefined();
  });

  it('refills another layout in order, resetting framing, and counts photos with no space left', () => {
    let s = createEmptyState('six', 1);
    for (const [i, id] of ['photo_01', 'photo_02', 'photo_10'].entries()) s = setSlotPhoto(s, id, photo(`p${i}`));
    s = { ...s, slots: { ...s.slots, photo_01: { ...s.slots.photo_01, transform: { scale: 3, offsetX: 0, offsetY: 0 }, confirmedLowDpi: true } } };
    const { state, dropped } = carryOverState(s, template('two', ['a', 'b']));
    // Numeric order: photo_01, photo_02, photo_10.
    expect(state.slots.a.assetId).toBe('p0');
    expect(state.slots.b.assetId).toBe('p1');
    expect(state.slots.a.transform).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
    expect(state.slots.a.confirmedLowDpi).toBe(false);
    expect(dropped).toBe(1);
  });
});

describe('planPhotoTargets', () => {
  const t = template('grid', ['s1', 's2', 's3', 's4']);

  it('fills empty spaces in order', () => {
    const state = setSlotPhoto(createEmptyState('grid', 1), 's2', photo('x'));
    expect(planPhotoTargets(t, state, 2)).toEqual({ targets: ['s1', 's3'], overflow: 0 });
  });

  it('puts the first photo in the chosen space (even a filled one), the rest in empty ones', () => {
    const state = setSlotPhoto(createEmptyState('grid', 1), 's2', photo('x'));
    expect(planPhotoTargets(t, state, 3, 's2')).toEqual({ targets: ['s2', 's1', 's3'], overflow: 0 });
  });

  it('reports photos that do not fit', () => {
    expect(planPhotoTargets(t, createEmptyState('grid', 1), 6)).toEqual({ targets: ['s1', 's2', 's3', 's4'], overflow: 2 });
  });
});

describe('template drafts', () => {
  beforeEach(() => window.localStorage.clear());

  it('saves only photos that are already uploaded, and restores them', () => {
    let s = setSlotPhoto(createEmptyState('grid', 1), 's1', photo('up_1'));
    s = setSlotPhoto(s, 's2', photo('local:123'));
    expect(Object.keys(persistableState(s).slots)).toEqual(['s1']);
    saveTemplateDraft('prod_1', s, 1000);
    const restored = loadTemplateDraft('prod_1', 'grid', 2000);
    expect(restored?.slots.s1.assetId).toBe('up_1');
    expect(restored?.slots.s2).toBeUndefined();
  });

  it('forgets drafts older than two weeks and empty ones', () => {
    saveTemplateDraft('prod_1', setSlotPhoto(createEmptyState('grid', 1), 's1', photo('up_1')), 0);
    expect(loadTemplateDraft('prod_1', 'grid', DRAFT_MAX_AGE_MS + 1)).toBeNull();
    saveTemplateDraft('prod_1', createEmptyState('grid', 1));
    expect(loadTemplateDraft('prod_1', 'grid')).toBeNull();
  });

  it('ignores corrupt data and can be cleared', () => {
    window.localStorage.setItem('kg:template-draft:v1:prod_1:grid', '{nope');
    expect(loadTemplateDraft('prod_1', 'grid')).toBeNull();
    saveTemplateDraft('prod_1', setSlotPhoto(createEmptyState('grid', 1), 's1', photo('up_1')));
    clearTemplateDraft('prod_1', 'grid');
    expect(loadTemplateDraft('prod_1', 'grid')).toBeNull();
  });
});

describe('uploadPhoto', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const file = new File([new Uint8Array([1, 2, 3])], 'p.jpg', { type: 'image/jpeg' });
  const ctx = { variantId: 'v1', sessionId: 'sess', authToken: 'tok' };
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });

  it('sends the session and sign-in, and returns the stored size', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { id: 'up_9', widthPx: 4000, heightPx: 3000, status: 'ready' }));
    await expect(uploadPhoto(file, ctx, fetchImpl)).resolves.toEqual({ id: 'up_9', width: 4000, height: 3000 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/uploads');
    expect(init.headers).toMatchObject({ 'X-Session-Id': 'sess', Authorization: 'Bearer tok' });
  });

  it('waits out a rate limit instead of failing a big collage', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(429, { code: 'rate_limited' }, { 'Retry-After': '2' }))
      .mockResolvedValueOnce(json(200, { id: 'up_9', widthPx: 10, heightPx: 10, status: 'ready' }));
    const done = uploadPhoto(file, ctx, fetchImpl);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(done).resolves.toMatchObject({ id: 'up_9' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('turns server error codes into customer messages', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(413, { code: 'file_too_large' }));
    const err = await uploadPhoto(file, ctx, fetchImpl).catch((e) => e);
    expect(err).toBeInstanceOf(PhotoError);
    expect(err.message).toMatch(/under 25 MB/);
  });
});

describe('createTaskQueue', () => {
  it('runs at most N jobs at once, in order', async () => {
    const enqueue = createTaskQueue(2);
    let running = 0;
    let peak = 0;
    const order: number[] = [];
    const job = (n: number) => async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      order.push(n);
      running--;
      return n;
    };
    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => enqueue(job(n))));
    expect(results).toEqual([1, 2, 3, 4, 5]);
    expect(peak).toBe(2);
    expect(order.slice(0, 2).sort()).toEqual([1, 2]);
  });
});

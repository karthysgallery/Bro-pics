'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  checkCompleteness,
  clearSlot,
  confirmLowDpi,
  createEmptyState,
  panTransform,
  resetSlotTransform,
  setSlotPhoto,
  setSlotRotation,
  setText,
  setCalendarDate,
  zoomTo,
  zoomTransform,
  type AssetRef,
  type Completeness,
  type PersonalizationState,
  type PersonalizationTemplate,
  type PhotoTransform,
  type PrintSizeIn,
  type Rotation,
  type SlotPhoto,
  type TextValue,
} from '@bro-pics/shared';
import { resolveFontFamilyForCanvas } from '../../lib/text-personalization-options';
import { templateAssetSrc } from './asset-src';
import { useImageCache, type ImageCache } from './image-cache';
import { usePhotoSources, type PhotoSources } from './use-photo-sources';
import { createTaskQueue, prepareLocalPhoto, PhotoError, requestCutout, uploadPhoto, type UploadedPhoto } from './photo-files';
import { planPhotoTargets, repeatPhotosIntoEmpty } from './state-carry';
import { renderToDataUrl, requiredImageSources, fontKeyOf } from './render-template';
import { loadTemplateDraft, saveTemplateDraft, hasContent, clearTemplateDraft } from './draft-store';

export interface CustomizerOptions {
  template: PersonalizationTemplate;
  productId: string;
  variantId: string;
  printSizeIn?: PrintSizeIn;
  /** Where to start: a cart line being edited, or work carried over from another size. */
  initialState?: PersonalizationState | null;
  /** Offer to restore a saved draft (off while editing a cart line). */
  useDrafts?: boolean;
  sessionId: () => string;
  authToken: () => Promise<string | null>;
}

export interface SlotActivity {
  uploading: boolean;
  /** What is happening while busy, when it is more than an upload (e.g. removing the background). */
  working?: string;
  error?: string;
}

const HISTORY_LIMIT = 60;
const COALESCE_MS = 800;

type Update = (state: PersonalizationState) => PersonalizationState;

function mapPhotos(state: PersonalizationState, fn: (photo: SlotPhoto) => SlotPhoto | null): PersonalizationState {
  let changed = false;
  const slots: PersonalizationState['slots'] = {};
  for (const [id, photo] of Object.entries(state.slots)) {
    const next = fn(photo);
    if (next !== photo) changed = true;
    if (next) slots[id] = next;
  }
  return changed ? { ...state, slots } : state;
}

function setTransform(state: PersonalizationState, slotId: string, transform: PhotoTransform): PersonalizationState {
  const photo = state.slots[slotId];
  if (!photo) return state;
  const t = photo.transform;
  if (t.scale === transform.scale && t.offsetX === transform.offsetX && t.offsetY === transform.offsetY) return state;
  return { ...state, slots: { ...state.slots, [slotId]: { ...photo, transform } } };
}

/**
 * Everything the template editor does with the customer's design, in one place
 * (so the canvas, the controls and add-to-cart can't disagree): the state and
 * its undo/redo history, photos added in bulk to the empty slots, uploads in
 * the background, drafts, completeness and the finished-design export.
 */
export function useTemplateCustomizer(options: CustomizerOptions) {
  const { template, productId, variantId, printSizeIn } = options;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [state, setStateRaw] = useState<PersonalizationState>(() => options.initialState ?? createEmptyState(template.id, template.version));
  const stateRef = useRef(state);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(template.photoSlots[0]?.id ?? null);
  const [activity, setActivity] = useState<Record<string, SlotActivity>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [historyFlags, setHistoryFlags] = useState({ canUndo: false, canRedo: false });
  const history = useRef({ past: [] as PersonalizationState[], future: [] as PersonalizationState[], lastKey: null as string | null, lastAt: 0 });
  const pending = useRef(new Map<string, Promise<boolean>>());
  const enqueue = useMemo(() => createTaskQueue(3), []);

  const photos: PhotoSources = usePhotoSources({ sessionId: options.sessionId, authToken: options.authToken });

  const syncFlags = () => setHistoryFlags({ canUndo: history.current.past.length > 0, canRedo: history.current.future.length > 0 });

  const commit = useCallback((next: PersonalizationState) => {
    stateRef.current = next;
    setStateRaw(next);
  }, []);

  /** Applies a change and records it for undo. Changes with the same `coalesce` key in quick succession (a drag, typing) are one step. */
  const apply = useCallback(
    (update: Update, opts: { coalesce?: string; sticky?: boolean } = {}) => {
      const prev = stateRef.current;
      const next = update(prev);
      if (next === prev) return;
      const h = history.current;
      const now = Date.now();
      const merge = opts.coalesce !== undefined && h.lastKey === opts.coalesce && (opts.sticky || now - h.lastAt < COALESCE_MS);
      if (!merge) {
        h.past.push(prev);
        if (h.past.length > HISTORY_LIMIT) h.past.shift();
      }
      h.future = [];
      h.lastKey = opts.coalesce ?? null;
      h.lastAt = now;
      commit(next);
      syncFlags();
    },
    [commit]
  );

  /** Rewrites every copy of the design (current and history) — used when an upload finishes or fails. */
  const rewriteEverywhere = useCallback(
    (fn: (photo: SlotPhoto) => SlotPhoto | null) => {
      const h = history.current;
      h.past = h.past.map((s) => mapPhotos(s, fn));
      h.future = h.future.map((s) => mapPhotos(s, fn));
      const next = mapPhotos(stateRef.current, fn);
      if (next !== stateRef.current) commit(next);
    },
    [commit]
  );

  const undo = useCallback(() => {
    const h = history.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(stateRef.current);
    h.lastKey = null;
    commit(prev);
    syncFlags();
  }, [commit]);

  const redo = useCallback(() => {
    const h = history.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(stateRef.current);
    h.lastKey = null;
    commit(next);
    syncFlags();
  }, [commit]);

  // --- Photos ------------------------------------------------------------

  const setSlotActivity = useCallback((slotId: string, value: SlotActivity | null) => {
    setActivity((prev) => {
      const next = { ...prev };
      if (value) next[slotId] = value;
      else delete next[slotId];
      return next;
    });
  }, []);

  const placeFile = useCallback(
    async (file: File, slotId: string, batchKey: string) => {
      const localId = `local:${crypto.randomUUID()}`;
      setSlotActivity(slotId, { uploading: true });
      let local;
      try {
        local = await prepareLocalPhoto(file);
      } catch (err) {
        setSlotActivity(slotId, { uploading: false, error: err instanceof PhotoError ? err.message : "This photo couldn't be read." });
        return;
      }
      photos.register(localId, local.src);
      apply((s) => setSlotPhoto(s, slotId, { assetId: localId, width: local.width, height: local.height }), { coalesce: batchKey, sticky: true });

      const job = enqueue(async () => {
        const opts = optionsRef.current;
        return uploadPhoto(file, { variantId: opts.variantId, sessionId: opts.sessionId(), authToken: await opts.authToken().catch(() => null) });
      })
        .then((uploaded: UploadedPhoto) => {
          photos.register(uploaded.id, local.src);
          rewriteEverywhere((p) => (p.assetId === localId ? { ...p, assetId: uploaded.id, width: uploaded.width, height: uploaded.height } : p));
          setSlotActivity(slotId, null);
          return true;
        })
        .catch((err: unknown) => {
          rewriteEverywhere((p) => (p.assetId === localId ? null : p));
          setSlotActivity(slotId, { uploading: false, error: err instanceof PhotoError ? err.message : "This photo couldn't be uploaded." });
          return false;
        })
        .finally(() => pending.current.delete(localId));
      pending.current.set(localId, job);
    },
    [apply, enqueue, photos, rewriteEverywhere, setSlotActivity]
  );

  // --- Cut-outs: photo spaces whose photo has its background removed --------

  /** Uploaded photos already sent for (or returned by) background removal. */
  const cutoutChecked = useRef(new Set<string>());
  useEffect(() => {
    for (const slot of template.photoSlots) {
      if (!slot.removeBackground) continue;
      const photo = state.slots[slot.id];
      if (!photo || photo.assetId.startsWith('local:') || cutoutChecked.current.has(photo.assetId)) continue;
      const original = photo.assetId;
      cutoutChecked.current.add(original);
      setSlotActivity(slot.id, { uploading: true, working: 'Removing the background…' });
      const job = (async () => {
        const opts = optionsRef.current;
        try {
          const cut = await requestCutout(original, { sessionId: opts.sessionId(), authToken: await opts.authToken().catch(() => null) });
          cutoutChecked.current.add(cut.id);
          if (cut.id !== original) {
            photos.ensure([cut.id]);
            // Same picture, same framing: only the asset (and its size, if it was capped) changes.
            rewriteEverywhere((p) => (p.assetId === original ? { ...p, assetId: cut.id, width: cut.width, height: cut.height } : p));
          }
          setSlotActivity(slot.id, null);
          return true;
        } catch (err) {
          setSlotActivity(slot.id, { uploading: false, error: err instanceof PhotoError ? err.message : 'The background could not be removed, so your photo is used as it is.' });
          // The photo itself is fine: the order can go ahead with it as it is.
          return true;
        } finally {
          pending.current.delete(`cutout:${original}`);
        }
      })();
      pending.current.set(`cutout:${original}`, job);
    }
  }, [template.photoSlots, state.slots, photos, rewriteEverywhere, setSlotActivity]);

  /** Adds photos: the chosen slot first, then every empty slot in order. */
  const addPhotos = useCallback(
    (files: File[], preferredSlotId?: string | null) => {
      const images = files.filter((f) => !f.type || f.type.startsWith('image/'));
      if (images.length === 0) return;
      const { targets, overflow } = planPhotoTargets(template, stateRef.current, images.length, preferredSlotId);
      setNotice(
        overflow > 0
          ? `${overflow} photo${overflow === 1 ? '' : 's'} didn't fit: this design has ${template.photoSlots.length} photo space${template.photoSlots.length === 1 ? '' : 's'}.`
          : null
      );
      const batchKey = `batch:${crypto.randomUUID()}`;
      targets.forEach((slotId, i) => void placeFile(images[i], slotId, batchKey));
      if (targets[0]) setActiveSlotId(targets[0]);
    },
    [placeFile, template]
  );

  const removePhoto = useCallback((slotId: string) => apply((s) => clearSlot(s, slotId)), [apply]);
  /** Fills empty spaces by repeating the photos already in the design. Returns how many were filled. */
  const repeatPhotos = useCallback(() => {
    const { state: next, filled } = repeatPhotosIntoEmpty(template, stateRef.current);
    if (filled > 0) apply(() => next);
    return filled;
  }, [apply, template]);
  const rotatePhoto = useCallback(
    (slotId: string) =>
      apply((s) => {
        const photo = s.slots[slotId];
        return photo ? setSlotRotation(s, slotId, (((photo.rotation + 90) % 360) as Rotation)) : s;
      }),
    [apply]
  );
  const resetPhoto = useCallback((slotId: string) => apply((s) => resetSlotTransform(s, slotId)), [apply]);
  const setLowDpiConfirmed = useCallback((slotId: string, value: boolean) => apply((s) => confirmLowDpi(s, slotId, value)), [apply]);

  const slotById = useMemo(() => new Map(template.photoSlots.map((s) => [s.id, s])), [template]);

  /** Drag: (dx, dy) in the pixels of a canvas `canvasWidth` × `canvasHeight` showing the whole design. */
  const panPhoto = useCallback(
    (slotId: string, dx: number, dy: number, canvasWidth: number, canvasHeight: number) => {
      const slot = slotById.get(slotId);
      if (!slot) return;
      apply(
        (s) => {
          const photo = s.slots[slotId];
          return photo ? setTransform(s, slotId, panTransform(slot, template.canvas, photo, dx, dy, canvasWidth, canvasHeight)) : s;
        },
        { coalesce: `pan:${slotId}` }
      );
    },
    [apply, slotById, template.canvas]
  );

  const zoomPhoto = useCallback(
    (slotId: string, factor: number, focus?: { u: number; v: number }) => {
      const slot = slotById.get(slotId);
      if (!slot) return;
      apply(
        (s) => {
          const photo = s.slots[slotId];
          return photo ? setTransform(s, slotId, zoomTransform(slot, template.canvas, photo, factor, focus)) : s;
        },
        { coalesce: `zoom:${slotId}` }
      );
    },
    [apply, slotById, template.canvas]
  );

  const setZoom = useCallback(
    (slotId: string, scale: number) => {
      const slot = slotById.get(slotId);
      if (!slot) return;
      apply(
        (s) => {
          const photo = s.slots[slotId];
          return photo ? setTransform(s, slotId, zoomTo(slot, template.canvas, photo, scale)) : s;
        },
        { coalesce: `zoom:${slotId}` }
      );
    },
    [apply, slotById, template.canvas]
  );

  // --- Text --------------------------------------------------------------

  const updateText = useCallback(
    (slotId: string, patch: Partial<TextValue>) => {
      const slot = template.textSlots.find((t) => t.id === slotId);
      if (!slot) return;
      apply(
        (s) => {
          const current = s.texts[slotId] ?? { value: slot.defaultValue };
          const value = patch.value !== undefined ? patch.value.slice(0, slot.maxLength) : current.value;
          return setText(s, slotId, { ...current, ...patch, value });
        },
        { coalesce: patch.value !== undefined ? `text:${slotId}` : undefined }
      );
    },
    [apply, template.textSlots]
  );

  // --- Calendars ----------------------------------------------------------

  const setDate = useCallback(
    (slotId: string, date: string | null) => {
      if (!(template.calendarSlots ?? []).some((c) => c.id === slotId)) return;
      apply((s) => setCalendarDate(s, slotId, date));
    },
    [apply, template.calendarSlots]
  );

  // --- Sources, images and fonts ----------------------------------------

  useEffect(() => {
    photos.ensure(Object.values(state.slots).map((p) => p.assetId));
  }, [state.slots, photos]);

  const assetSrc = useCallback((ref: AssetRef) => templateAssetSrc(ref), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const photoSrc = useCallback((_slotId: string, photo: SlotPhoto) => photos.srcFor(photo.assetId) ?? null, [photos.version]);
  const required = requiredImageSources({ template, state, assetSrc, photoSrc, includeUnprinted: true });
  const images: ImageCache = useImageCache(required.srcs);

  const [fontsVersion, setFontsVersion] = useState(0);
  const fontKeys = useMemo(
    () =>
      [
        ...new Set([
          ...template.textSlots.map((t) => fontKeyOf(state.texts[t.id]?.fontFamily, t.defaultFontFamily)),
          ...(template.calendarSlots ?? []).flatMap((c) => [c.titleFont, c.bodyFont]),
        ]),
      ]
        .sort()
        .join(','),
    [template.textSlots, template.calendarSlots, state.texts]
  );
  useEffect(() => {
    if (!fontKeys || typeof document === 'undefined' || !document.fonts?.load) return;
    let alive = true;
    Promise.all(fontKeys.split(',').map((key) => document.fonts.load(`32px ${resolveFontFamilyForCanvas(key)}`).catch(() => [])))
      .then(() => alive && setFontsVersion((v) => v + 1))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [fontKeys]);
  const fontFamily = useCallback((key: string) => resolveFontFamilyForCanvas(key), []);

  // --- Completeness, drafts, export -------------------------------------

  const completeness: Completeness = useMemo(() => checkCompleteness(template, state, { printSizeIn }), [template, state, printSizeIn]);
  const uploading = Object.values(activity).some((a) => a.uploading);
  const designReady = required.unresolvedPhotos.length === 0 && images.allLoaded(required.srcs);
  /** Slots whose saved photo could not be fetched again (expired, or uploaded in another session). */
  const unavailableSlots = Object.entries(state.slots)
    .filter(([, p]) => photos.status(p.assetId) === 'error')
    .map(([id]) => id);

  const [draftOffer, setDraftOffer] = useState<PersonalizationState | null>(null);
  useEffect(() => {
    if (options.useDrafts === false || options.initialState) return;
    const draft = loadTemplateDraft(productId, template.id);
    if (draft && draft.templateVersion === template.version) setDraftOffer(draft);
    // Only when the editor first opens for this design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, template.id, template.version]);

  const restoreDraft = useCallback(() => {
    if (!draftOffer) return;
    apply(() => draftOffer);
    setDraftOffer(null);
  }, [apply, draftOffer]);
  const discardDraft = useCallback(() => {
    clearTemplateDraft(productId, template.id);
    setDraftOffer(null);
  }, [productId, template.id]);

  useEffect(() => {
    if (options.useDrafts === false || !hasContent(state)) return;
    // Working on a new design answers the "continue where you left off?" offer.
    if (draftOffer) setDraftOffer(null);
    const t = setTimeout(() => saveTemplateDraft(productId, state), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, productId, options.useDrafts]);

  const exportDesign = useCallback(
    (maxSide: number, includeUnprinted = true): string | null =>
      renderToDataUrl({ template, state: stateRef.current, getImage: images.get, assetSrc, photoSrc, fontFamily, includeUnprinted }, maxSide),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [template, images.version, assetSrc, photoSrc, fontFamily]
  );

  /** Waits for photos still uploading. False if any failed (the slot is then empty again). */
  const waitForUploads = useCallback(async (): Promise<boolean> => {
    let ok = true;
    // A finished upload can start a background removal on the next render, so keep
    // waiting until nothing is in flight.
    for (let round = 0; round < 10 && (round === 0 || pending.current.size > 0); round++) {
      const results = await Promise.all([...pending.current.values()]);
      ok = ok && results.every(Boolean);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return ok && !Object.values(stateRef.current.slots).some((p) => p.assetId.startsWith('local:'));
  }, []);

  /** Loads a whole design (a cart line being edited) as the new starting point. */
  const replaceState = useCallback(
    (next: PersonalizationState) => {
      history.current = { past: [], future: [], lastKey: null, lastAt: 0 };
      commit(next);
      syncFlags();
      setDraftOffer(null);
    },
    [commit]
  );

  /** Starts over after the design went into the cart. */
  const resetDesign = useCallback(() => {
    clearTemplateDraft(productId, template.id);
    history.current = { past: [], future: [], lastKey: null, lastAt: 0 };
    commit(createEmptyState(template.id, template.version));
    syncFlags();
    setActivity({});
    setNotice(null);
  }, [commit, productId, template.id, template.version]);

  return {
    template,
    variantId,
    state,
    stateRef,
    activeSlotId,
    setActiveSlotId,
    activity,
    notice,
    dismissNotice: () => setNotice(null),
    completeness,
    uploading,
    designReady,
    canUndo: historyFlags.canUndo,
    canRedo: historyFlags.canRedo,
    undo,
    redo,
    addPhotos,
    removePhoto,
    repeatPhotos,
    rotatePhoto,
    resetPhoto,
    panPhoto,
    zoomPhoto,
    setZoom,
    setLowDpiConfirmed,
    updateText,
    setDate,
    draftOffer,
    restoreDraft,
    discardDraft,
    exportDesign,
    waitForUploads,
    resetDesign,
    replaceState,
    unavailableSlots,
    render: {
      getImage: images.get,
      imageStatus: images.status,
      photoStatus: (assetId: string) => photos.status(assetId),
      photoUnavailable: (photo: SlotPhoto) => photos.status(photo.assetId) === 'error',
      assetSrc,
      photoSrc,
      fontFamily,
      version: images.version + photos.version * 1000 + fontsVersion * 1_000_000,
    },
  };
}

export type TemplateCustomizer = ReturnType<typeof useTemplateCustomizer>;

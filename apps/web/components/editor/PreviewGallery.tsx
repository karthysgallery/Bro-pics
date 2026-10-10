'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { DEFAULT_PREVIEW_SCENES, type PreviewScene } from '../../lib/preview-scenes';
import type { FrameInches } from '../../lib/preview-scenes';
import { SceneStage, useFrameCutout } from './LifestylePreview';

/** The four views, in the order shoppers see them. */
export type PreviewViewId = 'plain' | 'bedroom' | 'hall' | 'table';

interface ViewDef {
  id: PreviewViewId;
  label: string;
  /** Which photographed scene this view uses (none for the plain frame). */
  sceneId?: string;
}

const VIEWS: ViewDef[] = [
  { id: 'plain', label: 'Frame' },
  { id: 'bedroom', label: 'Bedroom', sceneId: 'bedroom' },
  { id: 'hall', label: 'Hall', sceneId: 'living-room' },
  { id: 'table', label: 'Table', sceneId: 'table' },
];

/** How much the side zoom magnifies the main view. */
const ZOOM = 2;

/** The scene photographs are 4:3 but the stage is square: show the middle of the photo, edge to edge. */
const SCENE_WIDTH_PERCENT = (4 / 3) * 100;

/**
 * Follows `value` once it has stopped changing for `ms`, except that appearing or
 * disappearing (null <-> a picture) is immediate, so the first photo shows in every
 * view at once; only the stream of edits while dragging is smoothed.
 */
function useSettled<T>(value: T | null, ms: number): T | null {
  const [settled, setSettled] = useState<T | null>(value);
  useEffect(() => {
    if (value === null || settled === null) {
      setSettled(value);
      return;
    }
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ms]);
  return settled;
}

interface Pictures {
  /** The framed design (or product) to place in the rooms, cut out and measured. */
  roomUrl: string | null;
  roomAspect: number;
  /** What the plain view shows when it is not the live editor. */
  plainUrl: string | null;
}

/** One view's picture, drawn to fill its box. Used for the main view, the thumbnails and the zoomed copy. */
function ViewPicture({
  view,
  scenes,
  pictures,
  frameInches,
  alt,
  personalized,
}: {
  view: ViewDef;
  scenes: PreviewScene[];
  pictures: Pictures;
  frameInches: FrameInches | null;
  alt: string;
  /** True once the picture in the rooms is the customer's own design. */
  personalized: boolean;
}) {
  const scene = view.sceneId ? scenes.find((s) => s.id === view.sceneId) : undefined;
  if (scene) {
    return (
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0" style={{ left: `${-(SCENE_WIDTH_PERCENT - 100) / 2}%`, width: `${SCENE_WIDTH_PERCENT}%` }}>
          <SceneStage
            scene={scene}
            imageUrl={pictures.roomUrl}
            aspect={pictures.roomAspect}
            frameInches={frameInches}
            imageAlt={personalized ? 'Your personalized frame in the scene' : `${alt} in the scene`}
          />
        </div>
      </div>
    );
  }
  return pictures.plainUrl ? (
    <div className="absolute inset-0 flex items-center justify-center p-2 sm:p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={pictures.plainUrl} alt={alt} className="max-h-full max-w-full object-contain" />
    </div>
  ) : null;
}

/**
 * Amazon/Flipkart-style magnifier for a stage: on a mouse hover a lens marks the
 * spot and the same picture, twice the size, shows beside the stage. It only
 * watches the pointer (never takes events from what is underneath), and steps
 * aside while a button is held so it never gets in the way of dragging a photo.
 */
function SideZoom({ stageRef, content, enabled }: { stageRef: RefObject<HTMLDivElement>; content: ReactNode; enabled: boolean }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || !enabled) return;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.buttons !== 0) {
        setAt(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      setAt({
        x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
        y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
      });
    };
    const leave = () => setAt(null);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('pointerdown', leave);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('pointerdown', leave);
    };
  }, [stageRef, enabled]);

  if (!enabled || !at) return null;

  const lens = 100 / ZOOM;
  return (
    <>
      <div
        aria-hidden="true"
        data-testid="zoom-lens"
        className="pointer-events-none absolute hidden rounded-lg border border-white/80 bg-white/20 shadow-sm lg:block"
        style={{ width: `${lens}%`, height: `${lens}%`, left: `${at.x * (100 - lens)}%`, top: `${at.y * (100 - lens)}%` }}
      />
      <div
        aria-hidden="true"
        data-testid="zoom-pane"
        className="pointer-events-none absolute left-full top-0 z-30 ml-4 hidden aspect-square w-full overflow-hidden rounded-3xl border border-line bg-paper shadow-xl lg:block"
      >
        <div
          className="absolute left-0 top-0"
          style={{
            width: `${ZOOM * 100}%`,
            height: `${ZOOM * 100}%`,
            transform: `translate(${(-at.x * (ZOOM - 1) * 100) / ZOOM}%, ${(-at.y * (ZOOM - 1) * 100) / ZOOM}%)`,
          }}
        >
          {content}
        </div>
      </div>
    </>
  );
}

/** A product photo shown in the gallery after the preview views. */
export interface GalleryPhoto {
  url: string;
  alt: string;
  label: string;
}

/** The preview views, or one of the product photos ("photo-0", "photo-1"…). */
export type GalleryViewId = PreviewViewId | `photo-${number}`;

/** A media-library / upload image URL at another width (other URLs are used as they are). */
export function sizedUrl(url: string, width: number): string {
  return /[?&]w=\d+/.test(url) ? url.replace(/([?&])w=\d+/, `$1w=${width}`) : url;
}

interface ItemDef {
  id: GalleryViewId;
  label: string;
  view?: ViewDef;
  photo?: GalleryPhoto;
}

export interface PreviewGalleryProps {
  /** The product's original picture: shown, in every view, until the customer adds a photo. */
  defaultImageUrl: string | null;
  /** The customer's finished design (the editor's composite), once they have added a photo. */
  personalizedImageUrl: string | null;
  /** True once there is a customer photo. Until then every view shows the product itself. */
  hasPersonalization: boolean;
  frameInches?: FrameInches | null;
  /** Cut the frame out of a plain paper background before placing it in a room (off for edge-to-edge designs). */
  cutOut?: boolean;
  alt: string;
  /** The live editor. It stays mounted (but hidden) in the other views so it keeps drawing. */
  children: ReactNode;
  view?: GalleryViewId;
  onViewChange?: (view: GalleryViewId) => void;
  /** Shown over the main view's corner (e.g. an expand button) in the plain view. */
  stageOverlay?: ReactNode;
  scenes?: PreviewScene[];
  /** False for a design with nothing to edit (a ready-made frame): the plain view shows the framed picture instead of the editor. */
  showEditor?: boolean;
  /** Product photos (sizes, frame close-up…), browsed in the same gallery after the views. */
  photos?: GalleryPhoto[];
}

const arrowButton =
  'absolute top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-paper/90 text-ink shadow-md ring-1 ring-ink/10 backdrop-blur-xs transition-opacity hover:bg-paper focus-visible:opacity-100 sm:h-11 sm:w-11';

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {dir === 'left' ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
    </svg>
  );
}

/** Horizontal swipe on touch screens: calls back with -1 (to the previous) or +1 (to the next). */
function useSwipe(onSwipe: (dir: -1 | 1) => void, enabled: boolean) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (!enabled || e.pointerType === 'mouse') return;
      start.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e: React.PointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s || !enabled) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) onSwipe(dx < 0 ? 1 : -1);
    },
    onPointerCancel: () => {
      start.current = null;
    },
  };
}

/** A product photo filling its box, with a soft placeholder while it loads. */
function PhotoPicture({ photo, width, alt, eager }: { photo: GalleryPhoto; width: number; alt: string; eager?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-paper">
      {!loaded && <span className="absolute inset-0 animate-pulse bg-tint/70" aria-hidden="true" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sizedUrl(photo.url, width)}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={`relative max-h-full max-w-full object-contain transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}

/**
 * One gallery for a personalized product: the plain frame, three rooms, then
 * the product photos. Arrows (and a swipe on phones) step through all of
 * them; the strip below jumps straight to one; tapping the picture opens it
 * full screen. Every view is drawn from the same personalization — when the
 * customer's photo changes, all four views change.
 */
export function PreviewGallery({
  defaultImageUrl,
  personalizedImageUrl,
  hasPersonalization,
  frameInches = null,
  cutOut = true,
  alt,
  children,
  view: controlledView,
  onViewChange,
  stageOverlay,
  scenes = DEFAULT_PREVIEW_SCENES,
  showEditor = true,
  photos = [],
}: PreviewGalleryProps) {
  const [ownView, setOwnView] = useState<GalleryViewId>('plain');
  const view = controlledView ?? ownView;
  const setView = (next: GalleryViewId) => {
    setOwnView(next);
    onViewChange?.(next);
  };
  const stageRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  // Which ends of the strip have more pictures hidden: those ends fade, so it is clear the strip scrolls.
  const [more, setMore] = useState({ left: false, right: false });
  const measureRail = () => {
    const r = railRef.current;
    if (!r) return;
    setMore({ left: r.scrollLeft > 4, right: r.scrollLeft + r.clientWidth < r.scrollWidth - 4 });
  };
  useEffect(() => {
    measureRail();
    window.addEventListener('resize', measureRail);
    return () => window.removeEventListener('resize', measureRail);
  }, [photos.length]);

  // The editor redraws on every drag; the rooms and thumbnails follow it a moment later.
  const settledDesign = useSettled(hasPersonalization ? personalizedImageUrl : null, 180);
  const design = useFrameCutout(settledDesign, cutOut);
  const product = useFrameCutout(defaultImageUrl, true);

  const personalized = hasPersonalization && settledDesign !== null;
  // Only a product picture whose frame could be cut out is placed in a room. A lifestyle photo
  // (already a room) would end up as a room hanging on the wall, so the rooms stay empty instead.
  const productFitsRooms = product.status === 'cutout';
  const pictures: Pictures = useMemo(
    () =>
      personalized
        ? { roomUrl: design.url, roomAspect: design.aspect, plainUrl: settledDesign }
        : { roomUrl: productFitsRooms ? product.url : null, roomAspect: product.aspect, plainUrl: defaultImageUrl },
    [personalized, design.url, design.aspect, settledDesign, productFitsRooms, product.url, product.aspect, defaultImageUrl]
  );
  const roomsAwaitPhoto = !personalized && !productFitsRooms && product.status !== 'working';

  const items: ItemDef[] = useMemo(
    () => [...VIEWS.map((v) => ({ id: v.id, label: v.label, view: v })), ...photos.map((p, i) => ({ id: `photo-${i}` as const, label: p.label, photo: p }))],
    [photos]
  );
  const index = Math.max(0, items.findIndex((i) => i.id === view));
  const active = items[index]!;
  const step = (dir: -1 | 1) => setView(items[(index + dir + items.length) % items.length]!.id);

  // With no product picture to show yet, the editor's own frame is the plain view (never a blank).
  const showLiveEditor = showEditor && active.id === 'plain' && (hasPersonalization || !defaultImageUrl);
  // The main plain view is the live editor, so the zoom copy uses its latest picture.
  const zoomPictures: Pictures = hasPersonalization && personalizedImageUrl ? { ...pictures, plainUrl: personalizedImageUrl } : pictures;
  // Dragging a photo in the editor must not flip to the next picture.
  const swipe = useSwipe(step, !showLiveEditor);

  // Keep the chosen thumbnail in sight, and fetch the photos either side so arrows feel instant.
  useEffect(() => {
    const thumb = railRef.current?.querySelector<HTMLElement>(`[data-item="${active.id}"]`);
    thumb?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    for (const d of [-1, 1]) {
      const near = items[(index + d + items.length) % items.length];
      if (near?.photo) new Image().src = sizedUrl(near.photo.url, 1200);
    }
  }, [active.id, index, items]);

  const renderItem = (item: ItemDef, width: number, opts: { alt: string; eager?: boolean; pics?: Pictures }) =>
    item.photo ? (
      <PhotoPicture photo={item.photo} width={width} alt={opts.alt} eager={opts.eager} />
    ) : (
      <ViewPicture view={item.view!} scenes={scenes} pictures={opts.pics ?? pictures} frameInches={frameInches} alt={opts.alt} personalized={personalized} />
    );

  return (
    <div data-testid="preview-gallery" className="flex flex-col gap-3">
      <div className="relative mx-auto w-full max-w-[560px]">
        <div
          ref={stageRef}
          className="relative aspect-square w-full touch-pan-y rounded-3xl border border-line/90 bg-field shadow-xs"
          {...swipe}
        >
          <div className="absolute inset-0 overflow-hidden rounded-3xl">
            {/* The live editor: always mounted so the finished design keeps updating. */}
            <div className={`absolute inset-0 items-center justify-center p-2 sm:p-4 ${showLiveEditor ? 'flex' : 'hidden'}`}>{children}</div>

            {!showLiveEditor && (
              <button
                type="button"
                data-testid="preview-main-picture"
                data-view={active.id}
                onClick={() => setFullscreen(true)}
                aria-label={`Open ${active.label} full screen`}
                className="absolute inset-0 cursor-zoom-in"
              >
                {renderItem(active, 1200, { alt, eager: true })}
              </button>
            )}

            {active.view?.sceneId && (
              <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-ink/75 px-3 py-1 text-[11px] font-semibold text-paper backdrop-blur-xs">
                {active.label}
              </span>
            )}
            {active.view?.sceneId && roomsAwaitPhoto && (
              <span
                data-testid="rooms-await-photo"
                className="pointer-events-none absolute inset-x-4 bottom-4 rounded-full bg-paper/95 px-4 py-2 text-center text-xs font-semibold text-ink shadow-sm backdrop-blur-xs"
              >
                Add your photo to see it here
              </span>
            )}
            <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-ink/60 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-paper backdrop-blur-xs">
              {index + 1} / {items.length}
            </span>
            {showLiveEditor && stageOverlay}
          </div>

          {items.length > 1 && (
            <>
              <button type="button" onClick={() => step(-1)} aria-label="Previous picture" className={`${arrowButton} -left-3 sm:-left-5`}>
                <Chevron dir="left" />
              </button>
              <button type="button" onClick={() => step(1)} aria-label="Next picture" className={`${arrowButton} -right-3 sm:-right-5`}>
                <Chevron dir="right" />
              </button>
            </>
          )}

          <SideZoom
            stageRef={stageRef}
            enabled={!active.photo}
            content={<div className="absolute inset-0">{renderItem(active, 1600, { alt: '', pics: zoomPictures })}</div>}
          />
        </div>
      </div>

      <div
        ref={railRef}
        role="group"
        aria-label="Preview views"
        onScroll={measureRail}
        style={
          more.left || more.right
            ? {
                maskImage: `linear-gradient(to right, ${more.left ? 'transparent, black 40px' : 'black'}, ${more.right ? 'black calc(100% - 40px), transparent' : 'black'})`,
                WebkitMaskImage: `linear-gradient(to right, ${more.left ? 'transparent, black 40px' : 'black'}, ${more.right ? 'black calc(100% - 40px), transparent' : 'black'})`,
              }
            : undefined
        }
        className="rail mx-auto flex w-full max-w-[560px] snap-x snap-mandatory items-start gap-2.5 overflow-x-auto px-1 pb-1 pt-0.5 [scrollbar-width:none] sm:gap-3 [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => {
          const selected = item.id === active.id;
          return (
            <button
              key={item.id}
              type="button"
              data-item={item.id}
              aria-pressed={selected}
              aria-label={item.view ? `${item.label} view` : `${item.label} photo`}
              onClick={() => setView(item.id)}
              className="group flex w-[72px] shrink-0 snap-start flex-col items-center gap-1.5 focus:outline-none sm:w-[84px]"
            >
              <span
                className={`relative block aspect-square w-full overflow-hidden rounded-xl border bg-field transition-all group-focus-visible:ring-2 group-focus-visible:ring-ink/60 ${
                  selected ? 'border-ink ring-2 ring-gold shadow-xs' : 'border-line group-hover:border-ink/50'
                }`}
              >
                {renderItem(item, 240, { alt: '' })}
              </span>
              <span className={`w-full truncate text-center text-[11px] font-semibold ${selected ? 'text-ink' : 'text-ink/60'}`}>{item.label}</span>
            </button>
          );
        })}
      </div>

      {fullscreen && (
        <FullscreenViewer
          items={items}
          index={index}
          onIndex={(i) => setView(items[i]!.id)}
          onClose={() => setFullscreen(false)}
          render={(item, width) => renderItem(item, width, { alt: item.label, eager: true, pics: zoomPictures })}
        />
      )}
    </div>
  );
}

/** Full-screen browsing: arrows, swipe, ← → keys, Esc to close, and the strip to jump. */
function FullscreenViewer({
  items,
  index,
  onIndex,
  onClose,
  render,
}: {
  items: ItemDef[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  render: (item: ItemDef, width: number) => ReactNode;
}) {
  const step = (d: -1 | 1) => onIndex((index + d + items.length) % items.length);
  const swipe = useSwipe(step, true);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);
  const item = items[index]!;
  // Rendered at the top of the page: inside the sticky preview card it would sit under the site header.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`${item.label} — picture ${index + 1} of ${items.length}`} className="fixed inset-0 z-[200] flex flex-col bg-ink/95 text-paper">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-semibold">
          {item.label} <span className="font-normal tabular-nums text-paper/60">· {index + 1} / {items.length}</span>
        </span>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full bg-paper/10 text-2xl leading-none hover:bg-paper/20">
          ×
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 touch-pan-y" {...swipe}>
        <div className="relative aspect-square w-full max-w-[min(92vw,calc(100vh-200px))] overflow-hidden rounded-2xl bg-paper">{render(item, 2000)}</div>
        <button type="button" onClick={() => step(-1)} aria-label="Previous picture" className={`${arrowButton} left-3 sm:left-6`}>
          <Chevron dir="left" />
        </button>
        <button type="button" onClick={() => step(1)} aria-label="Next picture" className={`${arrowButton} right-3 sm:right-6`}>
          <Chevron dir="right" />
        </button>
      </div>
      <div className="flex justify-center gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
        {items.map((it, i) => (
          <button
            key={it.id}
            type="button"
            onClick={() => onIndex(i)}
            aria-label={`Show ${it.label}`}
            aria-current={i === index}
            className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 ${i === index ? 'border-gold' : 'border-transparent opacity-60 hover:opacity-100'}`}
          >
            {render(it, 240)}
          </button>
        ))}
      </div>
    </div>,
    document.body
  );
}

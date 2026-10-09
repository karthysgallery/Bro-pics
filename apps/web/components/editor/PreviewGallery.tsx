'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
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
  view?: PreviewViewId;
  onViewChange?: (view: PreviewViewId) => void;
  /** Shown over the main view's corner (e.g. an expand button) in the plain view. */
  stageOverlay?: ReactNode;
  scenes?: PreviewScene[];
  /** False for a design with nothing to edit (a ready-made frame): the plain view shows the framed picture instead of the editor. */
  showEditor?: boolean;
}

/**
 * One preview for a personalized product: the plain frame plus three rooms,
 * switched with thumbnails below the main picture. Every view is drawn from the
 * same personalization — when the customer's photo changes, all four change.
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
}: PreviewGalleryProps) {
  const [ownView, setOwnView] = useState<PreviewViewId>('plain');
  const view = controlledView ?? ownView;
  const setView = (next: PreviewViewId) => {
    setOwnView(next);
    onViewChange?.(next);
  };
  const stageRef = useRef<HTMLDivElement>(null);

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

  const active = VIEWS.find((v) => v.id === view) ?? VIEWS[0];
  // With no product picture to show yet, the editor's own frame is the plain view (never a blank).
  const showLiveEditor = showEditor && active.id === 'plain' && (hasPersonalization || !defaultImageUrl);
  // The main plain view is the live editor, so the zoom copy uses its latest picture.
  const zoomPictures: Pictures = hasPersonalization && personalizedImageUrl ? { ...pictures, plainUrl: personalizedImageUrl } : pictures;

  return (
    <div data-testid="preview-gallery" className="flex flex-col gap-3">
      <div className="relative mx-auto w-full max-w-[560px]">
        <div ref={stageRef} className="relative aspect-square w-full rounded-3xl border border-line/90 bg-field shadow-xs">
          <div className="absolute inset-0 overflow-hidden rounded-3xl">
            {/* The live editor: always mounted so the finished design keeps updating. */}
            <div className={`absolute inset-0 items-center justify-center p-2 sm:p-4 ${showLiveEditor ? 'flex' : 'hidden'}`}>{children}</div>

            {!showLiveEditor && (
              <div data-testid="preview-main-picture" data-view={active.id} className="absolute inset-0">
                <ViewPicture view={active} scenes={scenes} pictures={pictures} frameInches={frameInches} alt={alt} personalized={personalized} />
              </div>
            )}

            {active.sceneId && (
              <span className="absolute left-3 top-3 rounded-full bg-ink/75 px-3 py-1 text-[11px] font-semibold text-paper backdrop-blur-xs">
                {active.label}
              </span>
            )}
            {active.sceneId && roomsAwaitPhoto && (
              <span
                data-testid="rooms-await-photo"
                className="absolute inset-x-4 bottom-4 rounded-full bg-paper/95 px-4 py-2 text-center text-xs font-semibold text-ink shadow-sm backdrop-blur-xs"
              >
                Add your photo to see it here
              </span>
            )}
            {showLiveEditor && stageOverlay}
          </div>

          <SideZoom
            stageRef={stageRef}
            enabled
            content={
              <div className="absolute inset-0">
                <ViewPicture view={active} scenes={scenes} pictures={zoomPictures} frameInches={frameInches} alt="" personalized={personalized} />
              </div>
            }
          />
        </div>
      </div>

      <div role="group" aria-label="Preview views" className="mx-auto flex w-full max-w-[560px] items-start justify-center gap-2.5 sm:gap-3">
        {VIEWS.map((v) => {
          const selected = v.id === active.id;
          return (
            <button
              key={v.id}
              type="button"
              aria-pressed={selected}
              aria-label={`${v.label} view`}
              onClick={() => setView(v.id)}
              className="group flex min-w-0 flex-1 flex-col items-center gap-1.5 focus:outline-none"
            >
              <span
                className={`relative block aspect-square w-full max-w-[96px] overflow-hidden rounded-xl border bg-field transition-all group-focus-visible:ring-2 group-focus-visible:ring-ink/60 ${
                  selected ? 'border-ink ring-2 ring-gold shadow-xs' : 'border-line group-hover:border-ink/50'
                }`}
              >
                <ViewPicture view={v} scenes={scenes} pictures={pictures} frameInches={frameInches} alt="" personalized={personalized} />
              </span>
              <span className={`text-[11px] font-semibold ${selected ? 'text-ink' : 'text-ink/60'}`}>{v.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

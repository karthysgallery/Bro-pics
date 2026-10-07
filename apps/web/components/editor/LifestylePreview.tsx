'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { cutOutFrameFromUrl, type FrameCutout } from '../../lib/frame-cutout';
import { quadToMatrix3d, type Quad } from '../../lib/homography';
import {
  DEFAULT_PREVIEW_SCENES,
  layoutFrameInScene,
  type FrameInches,
  type PreviewScene,
  type SceneKind,
  type SceneLight,
  type SceneTone,
} from '../../lib/preview-scenes';

interface LifestylePreviewProps {
  /** The customer's finished design (the editor's composite). Null until a photo is added. */
  imageUrl: string | null;
  /** Real frame size, so it is drawn at its true proportion of the scene. */
  frameInches?: FrameInches | null;
  scenes?: PreviewScene[];
  /**
   * Cut the frame out of a plain paper background first (the classic editor's
   * mockup has one). Off for a template design, which is already exactly the
   * frame edge to edge — a light photo at its edge must not be eaten away.
   */
  cutOut?: boolean;
  /** Shown over the scene before there is a design to place. */
  emptyMessage?: string;
}

const DEFAULT_LIGHT: SceneLight = { angleDeg: 65, strength: 0.7 };

/** Scenes drawn in CSS/SVG, used when a scene has no photograph (or its photo fails to load). */
function ProceduralBackdrop({ variant }: { variant: SceneKind }) {
  if (variant === 'wall') {
    return (
      <>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,#eee5d6 0%,#e4d9c6 80%,#d6c9b3 100%)' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 55% at 16% 6%, rgba(255,255,255,0.7), transparent 70%)' }} />
        <div className="absolute inset-x-0 bottom-0 h-[8%]" style={{ background: 'linear-gradient(180deg,#d4c8b2,#c4b79f)', boxShadow: '0 -3px 6px rgba(60,40,20,0.15)' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 42%, transparent 55%, rgba(60,40,20,0.2) 100%)' }} />
      </>
    );
  }
  if (variant === 'room') {
    return (
      <>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,#dcd6c8 0%,#d3ccbc 100%)' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 50% at 80% 8%, rgba(255,246,225,0.75), transparent 70%)' }} />
        <div className="absolute inset-x-0" style={{ top: '66%', bottom: '14%', background: 'linear-gradient(180deg,#e6e0d3,#dbd4c5)', borderTop: '3px solid #efeadf', boxShadow: '0 -2px 5px rgba(60,40,20,0.12)' }} />
        <div className="absolute inset-x-0 bottom-0 h-[14%]" style={{ background: 'repeating-linear-gradient(90deg,#b08a62 0 11%,#a77f58 11% 12%)', boxShadow: 'inset 0 6px 8px rgba(40,25,10,0.25)' }} />
        <svg className="absolute" style={{ left: '12%', width: '76%', bottom: '9%' }} viewBox="0 0 100 34" aria-hidden="true">
          <rect x="6" y="8" width="88" height="18" rx="5" fill="#9b7762" />
          <rect x="0" y="12" width="14" height="22" rx="6" fill="#8d6a56" />
          <rect x="86" y="12" width="14" height="22" rx="6" fill="#8d6a56" />
          <rect x="14" y="14" width="34" height="16" rx="4" fill="#b08a74" />
          <rect x="52" y="14" width="34" height="16" rx="4" fill="#b08a74" />
          <rect x="16" y="4" width="14" height="14" rx="3" fill="#d7c3a5" transform="rotate(-8 23 11)" />
          <rect x="4" y="30" width="92" height="3" rx="1.5" fill="rgba(40,25,10,0.3)" />
        </svg>
        <svg className="absolute" style={{ right: '4%', bottom: '10%', width: '9%' }} viewBox="0 0 20 70" aria-hidden="true">
          <path d="M3 16 L17 16 L14 3 L6 3 Z" fill="#f1dfb8" />
          <rect x="9.4" y="16" width="1.2" height="48" fill="#6b5842" />
          <ellipse cx="10" cy="66" rx="7" ry="2" fill="#6b5842" />
        </svg>
      </>
    );
  }
  return (
    <>
      <div className="absolute inset-x-0 top-0" style={{ height: '66%', background: 'linear-gradient(180deg,#e9e0d1 0%,#dcd1be 100%)' }} />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 45% at 20% 6%, rgba(255,255,255,0.7), transparent 70%)' }} />
      <div className="absolute inset-x-0 bottom-0" style={{ top: '64%', background: 'linear-gradient(180deg,#b78a5b 0%,#a37748 55%,#8f6538 100%)', boxShadow: 'inset 0 5px 8px rgba(255,255,255,0.18), 0 -4px 10px rgba(45,28,12,0.25)' }} />
      <div className="absolute inset-x-0" style={{ top: '64%', height: '5%', background: 'linear-gradient(180deg,rgba(255,255,255,0.22),transparent)' }} />
      <svg className="absolute" style={{ left: '9%', top: '57%', width: '8%' }} viewBox="0 0 20 28" aria-hidden="true">
        <rect x="3" y="8" width="14" height="19" rx="2" fill="#efe6d3" />
        <ellipse cx="10" cy="27" rx="8" ry="1.6" fill="rgba(45,28,12,0.28)" />
        <path d="M10 1c2 2.4 2 4.4 0 6c-2-1.6-2-3.6 0-6z" fill="#f0b24a" />
      </svg>
      <svg className="absolute" style={{ right: '8%', top: '45%', width: '16%' }} viewBox="0 0 40 60" aria-hidden="true">
        <path d="M20 40 C8 34 6 18 12 6 C16 18 20 26 20 40Z" fill="#5f7a54" />
        <path d="M20 40 C30 32 34 20 30 8 C24 18 20 28 20 40Z" fill="#6f8c61" />
        <path d="M20 40 C16 28 22 16 20 2 C26 14 24 28 20 40Z" fill="#4f6a46" />
        <path d="M10 40 H30 L27 58 H13Z" fill="#c9b79a" />
        <ellipse cx="20" cy="59" rx="9" ry="1.6" fill="rgba(45,28,12,0.3)" />
      </svg>
    </>
  );
}

/** Measures an element's width, falling back to window resizes where ResizeObserver is missing. */
function useElementWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

/** The finished frame cut out of its paper background, or the original while that is worked out / when it is not possible. */
export type CutoutStatus = 'none' | 'working' | 'cutout' | 'uncut';

export function useFrameCutout(imageUrl: string | null, enabled: boolean) {
  const [cutout, setCutout] = useState<FrameCutout | null>(null);
  const [measuredAspect, setMeasuredAspect] = useState(1);
  // 'cutout': the frame was isolated; 'uncut': it could not be (e.g. a lifestyle photo, not a plain-background product shot).
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    setCutout(null);
    setFinished(false);
    if (!imageUrl) return;
    let cancelled = false;
    // Measured independently of the rendered <img>, so a cached image that
    // loaded before hydration still gets the right frame shape.
    const probe = new Image();
    probe.onload = () => {
      if (!cancelled && probe.naturalWidth > 0 && probe.naturalHeight > 0) setMeasuredAspect(probe.naturalWidth / probe.naturalHeight);
    };
    probe.src = imageUrl;
    if (enabled) {
      cutOutFrameFromUrl(imageUrl).then((result) => {
        if (cancelled) return;
        setCutout(result);
        setFinished(true);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [imageUrl, enabled]);

  const status: CutoutStatus = !imageUrl ? 'none' : cutout ? 'cutout' : enabled && !finished ? 'working' : 'uncut';

  return {
    url: cutout?.url ?? imageUrl,
    aspect: cutout?.aspect ?? measuredAspect,
    status,
  };
}

function toneFilter(tone?: SceneTone): string {
  if (!tone) return '';
  const { brightness = 1, contrast = 1, saturate = 1, warmth = 0 } = tone;
  return `brightness(${brightness}) contrast(${contrast}) saturate(${saturate})${warmth > 0 ? ` sepia(${warmth})` : ''}`;
}

/**
 * Shadows for a frame `widthPx` wide: a soft cast shadow thrown away from the
 * scene's light, plus a tight contact shadow where it meets the wall or table.
 * Offsets scale with the frame, so the shadow reads the same at any size.
 */
function shadowFilter(widthPx: number, light: SceneLight, standing: boolean): string {
  const rad = (light.angleDeg * Math.PI) / 180;
  const throwDistance = widthPx * (standing ? 0.05 : 0.035);
  const dx = Math.cos(rad) * throwDistance;
  const dy = Math.sin(rad) * throwDistance;
  const blur = widthPx * (standing ? 0.06 : 0.05);
  const cast = 0.34 * light.strength;
  const contact = 0.42 * light.strength;
  return (
    `drop-shadow(${dx.toFixed(2)}px ${dy.toFixed(2)}px ${blur.toFixed(2)}px rgba(35,22,10,${cast.toFixed(3)})) ` +
    `drop-shadow(0 ${(widthPx * 0.004).toFixed(2)}px ${(widthPx * 0.009).toFixed(2)}px rgba(35,22,10,${contact.toFixed(3)}))`
  );
}

export interface SceneStageProps {
  scene: PreviewScene;
  /** The framed design, already cut out (see useFrameCutout); null draws the empty scene. */
  imageUrl: string | null;
  /** Width / height of `imageUrl`. */
  aspect: number;
  /** Real frame size, so it is drawn at its true proportion of the scene. */
  frameInches?: FrameInches | null;
  /** Description of the framed picture for screen readers. */
  imageAlt?: string;
}

/**
 * One room scene with the framed design placed in it: the backdrop photo (or a
 * drawn fallback), the frame at its real proportion, a shadow cast away from
 * the photo's light, colour matched to the room, and a glass sheen. No labels
 * or controls, so it can be a main view, a thumbnail or a zoomed copy.
 */
export function SceneStage({ scene, imageUrl, aspect, frameInches = null, imageAlt = 'Your personalized frame in the scene' }: SceneStageProps) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const stage = useElementWidth();

  const placeholder = !imageUrl;
  const photo = scene.backdrop.type === 'photo' && !photoFailed ? scene.backdrop : null;
  const quad = photo && photo.artworkQuad && photo.artworkAspect ? photo : null;
  const layout = layoutFrameInScene(scene, aspect, frameInches);
  const { frame } = scene;
  const standing = frame.anchor === 'bottom';
  const light = scene.light ?? DEFAULT_LIGHT;
  const frameWidthPx = layout.width * stage.width;
  // The glass catches the light on the side it comes from: point the sheen
  // from the light towards the side the shadow falls on.
  const shadowRad = (light.angleDeg * Math.PI) / 180;
  const sheenAngle = Math.round(((Math.atan2(Math.cos(shadowRad), -Math.sin(shadowRad)) * 180) / Math.PI + 360) % 360);

  const rotations = [
    frame.rotateX ? `rotateX(${frame.rotateX}deg)` : '',
    frame.rotateY ? `rotateY(${frame.rotateY}deg)` : '',
    frame.rotateZ ? `rotateZ(${frame.rotateZ}deg)` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const frameStyle: CSSProperties = {
    left: `${frame.x * 100}%`,
    top: `${frame.y * 100}%`,
    width: `${layout.width * 100}%`,
    aspectRatio: String(aspect),
    transform: `translate(-50%, ${standing ? '-100%' : '-50%'}) ${rotations}`.trim(),
    transformOrigin: standing ? '50% 100%' : '50% 50%',
    filter: `${toneFilter(scene.tone)} ${shadowFilter(frameWidthPx, light, standing)}`.trim(),
  };

  // Perspective-warped placement for photos shot at an angle.
  let quadTransform: string | undefined;
  let planeSize: { w: number; h: number } | null = null;
  if (quad && quad.artworkQuad && quad.artworkAspect && stage.width > 0) {
    const stageHeight = stage.width / quad.aspect;
    const px = quad.artworkQuad.map((p) => ({ x: p.x * stage.width, y: p.y * stageHeight })) as Quad;
    planeSize = { w: 1000, h: 1000 / quad.artworkAspect };
    try {
      quadTransform = quadToMatrix3d(planeSize.w, planeSize.h, px);
    } catch {
      quadTransform = undefined;
    }
  }

  const stageAspect = photo ? String(photo.aspect) : '1 / 1';

  return (
    <div ref={stage.ref} className="relative w-full" style={{ aspectRatio: stageAspect, perspective: '1200px' }}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.src}
          alt=""
          title={photo.credit}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setPhotoFailed(true)}
        />
      ) : (
        <ProceduralBackdrop variant={scene.kind} />
      )}

      {standing && !placeholder && !quad && (
        <div
          aria-hidden="true"
          className="absolute rounded-[50%]"
          style={{
            left: `${frame.x * 100}%`,
            top: `${frame.y * 100}%`,
            width: `${layout.width * 100 * 0.96}%`,
            height: `${Math.max(1.6, layout.width * 100 * 0.07)}%`,
            transform: 'translate(-50%, -50%)',
            background: `rgba(30,18,6,${(0.5 * light.strength + 0.12).toFixed(2)})`,
            filter: 'blur(6px)',
          }}
        />
      )}

      {!placeholder && !quad && (
        <div className="absolute" style={frameStyle}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={imageAlt} className="block h-full w-full" />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background: `linear-gradient(${sheenAngle}deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 36%, rgba(255,255,255,0) 64%, rgba(255,255,255,0.1) 100%)`,
              mixBlendMode: 'screen',
            }}
          />
        </div>
      )}

      {!placeholder && quad && planeSize && quadTransform && (
        <div
          className="absolute left-0 top-0"
          style={{ width: planeSize.w, height: planeSize.h, transformOrigin: '0 0', transform: quadTransform, filter: toneFilter(scene.tone) || undefined }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={imageAlt} className="h-full w-full object-contain" />
        </div>
      )}

      {photo?.foregroundSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo.foregroundSrc} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
      )}
    </div>
  );
}

/**
 * The customer's finished frame shown where it will live: on a wall, in a
 * living room, on a table. Scene data lives in `lib/preview-scenes.ts`; the
 * drawing itself is `SceneStage`. The same design follows the customer from
 * scene to scene.
 */
export function LifestylePreview({
  imageUrl,
  frameInches = null,
  scenes = DEFAULT_PREVIEW_SCENES,
  cutOut = true,
  emptyMessage = 'Add a photo to see your frame in this room.',
}: LifestylePreviewProps) {
  const [sceneId, setSceneId] = useState(scenes[0]?.id ?? '');
  const { url, aspect } = useFrameCutout(imageUrl, cutOut);
  const scene = scenes.find((s) => s.id === sceneId) ?? scenes[0];

  if (!scene) return null;

  const placeholder = !imageUrl;

  return (
    <div data-testid="lifestyle-preview" className="flex w-full flex-col gap-3">
      <div className="relative w-full overflow-hidden rounded-2xl border border-line/60 bg-tint">
        <SceneStage scene={scene} imageUrl={placeholder ? null : url} aspect={aspect} frameInches={frameInches} />

        {placeholder && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm font-medium text-ink/55">
            {emptyMessage}
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-ink/75 px-3 py-1 text-[11px] font-semibold text-paper backdrop-blur-xs">
          {scene.label}
        </span>
      </div>

      {scenes.length > 1 && (
        <div role="group" aria-label="Choose a scene" className="flex flex-wrap items-center justify-center gap-2">
          {scenes.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={s.id === scene.id}
              onClick={() => setSceneId(s.id)}
              className={`h-10 rounded-full border px-4 text-[13px] font-semibold transition-colors ${
                s.id === scene.id ? 'border-ink bg-ink text-paper' : 'border-line bg-paper text-ink/75 hover:border-ink/50'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

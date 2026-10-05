import type { Quad } from './homography';

/**
 * Lifestyle preview scenes. Everything about a scene lives here as data (no
 * coordinates in React components), in fractions of the stage so it scales to
 * any screen. Two kinds of backdrop:
 *
 * - `procedural`: drawn in CSS/SVG, so scenes work before any photography exists.
 * - `photo`: a real photograph. The customer's finished frame (cut out of its
 *   background) is placed on it at `scene.frame`, at its real size relative to
 *   the room (`stageWidthIn`), with a shadow cast away from the photo's light.
 *   For a photo shot at an angle, give `artworkQuad` instead: the four corners
 *   (clockwise from top-left, fractions of the photo) of where the whole framed
 *   product lands, and the frame is warped onto it with a homography so it keeps
 *   the photo's perspective. `artworkAspect` is that quad's flat width/height.
 */
export type SceneKind = 'wall' | 'room' | 'table';

export interface FramePlacement {
  /** Anchor point as fractions of the stage. */
  x: number;
  y: number;
  /** `bottom` stands the frame on that point (a table); `center` hangs it there. */
  anchor: 'center' | 'bottom';
  /** Largest share of the stage the frame may fill, on its longer side. */
  maxFraction: number;
  /** Degrees. Used to stand a frame at a slight angle. */
  rotateY?: number;
  rotateX?: number;
  rotateZ?: number;
}

export type SceneBackdrop =
  | { type: 'procedural'; variant: SceneKind }
  | {
      type: 'photo';
      src: string;
      /** Photo width / height. */
      aspect: number;
      /** Perspective placement for angled photos; omit to place the frame upright at `scene.frame`. */
      artworkQuad?: Quad;
      artworkAspect?: number;
      /** Optional shadows / glass laid above the frame (e.g. a table edge in front of it). */
      foregroundSrc?: string;
      /** Photographer credit shown as the image's tooltip and kept in public/scenes/CREDITS.md. */
      credit?: string;
    };

/** Direction and strength of the light in the scene, so the frame's shadow agrees with the photo. */
export interface SceneLight {
  /** Direction the shadow falls, degrees: 0 = right, 90 = down, 180 = left. */
  angleDeg: number;
  /** 0 (flat, overcast) to 1 (strong, directional). */
  strength: number;
}

/** Gentle colour matching so a studio-lit frame sits in the photo's light. All optional; 1 = unchanged. */
export interface SceneTone {
  brightness?: number;
  contrast?: number;
  saturate?: number;
  /** 0 to 1: warms the frame towards the photo's colour temperature. */
  warmth?: number;
}

export interface PreviewScene {
  id: string;
  label: string;
  kind: SceneKind;
  backdrop: SceneBackdrop;
  /** Real-world width the stage represents, so a 5x7 looks small and a 24x36 large. */
  stageWidthIn: number;
  frame: FramePlacement;
  light?: SceneLight;
  tone?: SceneTone;
  /** Smallest the frame's longer side may be drawn, as a share of the stage width (keeps tiny frames legible). */
  minFraction?: number;
}

/**
 * Scenes every customizable frame gets until a design supplies its own: real
 * photographs (see public/scenes/CREDITS.md). Placement, scale, light and tone
 * were measured against each photo; if a photo ever fails to load, the preview
 * falls back to a drawn scene of the same `kind`.
 *
 * `stageWidthIn` is how many real inches the photo's width spans at the wall
 * (or table), estimated from objects of known size in it (a door, a dresser, a
 * side table), so a 12x18 frame is drawn at 12x18 relative to the room.
 */
export const DEFAULT_PREVIEW_SCENES: PreviewScene[] = [
  {
    id: 'living-room',
    label: 'Living room',
    kind: 'room',
    backdrop: {
      type: 'photo',
      src: '/scenes/living-room.jpg',
      aspect: 4 / 3,
      credit: 'Photo: Alexandra Gorn on Unsplash',
    },
    stageWidthIn: 109,
    frame: { x: 0.304, y: 0.305, anchor: 'center', maxFraction: 0.34 },
    light: { angleDeg: 75, strength: 0.5 },
    tone: { brightness: 0.99, contrast: 1, saturate: 0.96 },
    minFraction: 0.14,
  },
  {
    id: 'bedroom',
    label: 'Bedroom',
    kind: 'room',
    backdrop: {
      type: 'photo',
      src: '/scenes/bedroom.jpg',
      aspect: 4 / 3,
      credit: 'Photo: Clay Banks on Unsplash',
    },
    stageWidthIn: 101,
    frame: { x: 0.5545, y: 0.2256, anchor: 'center', maxFraction: 0.34 },
    light: { angleDeg: 35, strength: 0.6 },
    tone: { brightness: 0.93, contrast: 1.03, saturate: 0.98, warmth: 0.12 },
    minFraction: 0.14,
  },
  {
    id: 'wall',
    label: 'Wall',
    kind: 'wall',
    backdrop: {
      type: 'photo',
      src: '/scenes/wall.jpg',
      aspect: 4 / 3,
      credit: 'Photo: mk. s on Unsplash',
    },
    stageWidthIn: 92,
    frame: { x: 0.508, y: 0.356, anchor: 'center', maxFraction: 0.38 },
    light: { angleDeg: 80, strength: 0.5 },
    tone: { brightness: 0.99, warmth: 0.08 },
    minFraction: 0.15,
  },
  {
    id: 'table',
    label: 'Table',
    kind: 'table',
    backdrop: {
      type: 'photo',
      src: '/scenes/table.jpg',
      aspect: 4 / 3,
      credit: 'Photo: Suzanne Rushton on Unsplash',
    },
    // A 42in dresser; the frame leans against the wall in the gap between the
    // vase and the stacked books, lit by the lamp on the right.
    stageWidthIn: 52,
    frame: { x: 0.49, y: 0.633, anchor: 'bottom', maxFraction: 0.5 },
    light: { angleDeg: 150, strength: 0.55 },
    tone: { brightness: 1, warmth: 0.06 },
    minFraction: 0.16,
  },
];

export interface FrameInches {
  widthIn: number;
  heightIn: number;
}

/** Width / height of a scene's stage. */
export function sceneAspect(scene: PreviewScene): number {
  return scene.backdrop.type === 'photo' ? scene.backdrop.aspect : 1;
}

/**
 * Size of the frame in a scene, both as fractions of the stage WIDTH. With
 * known dimensions the frame is drawn at its real proportion of the scene;
 * without them it fills the scene's maximum. It is kept inside `maxFraction`
 * with its own aspect ratio and never shrinks below a legible minimum, and
 * finally it always fits inside the stage around its anchor: a big frame on a
 * small table is shown as large as the photo allows, never cut off.
 */
export function layoutFrameInScene(
  scene: PreviewScene,
  aspect: number,
  inches?: FrameInches | null
): { width: number; height: number } {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const max = scene.frame.maxFraction;
  let width: number;
  let height: number;
  if (inches && inches.widthIn > 0 && inches.heightIn > 0) {
    // Variant dimensions may be listed the other way round from the picture.
    const swap = inches.widthIn >= inches.heightIn !== safeAspect >= 1;
    width = (swap ? inches.heightIn : inches.widthIn) / scene.stageWidthIn;
    height = (swap ? inches.widthIn : inches.heightIn) / scene.stageWidthIn;
  } else {
    width = safeAspect >= 1 ? max : max * safeAspect;
    height = width / safeAspect;
  }
  const longest = Math.max(width, height);
  if (longest > max) {
    const k = max / longest;
    width *= k;
    height *= k;
  }
  const min = scene.minFraction ?? 0.15;
  if (Math.max(width, height) < min) {
    const k = min / Math.max(width, height);
    width *= k;
    height *= k;
  }
  // Room around the anchor, in the same units (fractions of the stage width).
  const stageHeight = 1 / sceneAspect(scene);
  const { x, y, anchor } = scene.frame;
  const roomWidth = 2 * Math.min(x, 1 - x) * 0.96;
  const roomHeight = (anchor === 'bottom' ? y : 2 * Math.min(y, 1 - y)) * stageHeight * 0.94;
  if (width > roomWidth || height > roomHeight) {
    const k = Math.min(roomWidth / width, roomHeight / height);
    width *= k;
    height *= k;
  }
  return { width, height };
}

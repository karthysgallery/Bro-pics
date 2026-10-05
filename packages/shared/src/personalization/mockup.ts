import { z } from 'zod';
import { AssetRefSchema, fraction, type PersonalizationTemplate } from './template-schema';
import { stateFingerprint, type PersonalizationState } from './state';

/**
 * Mockup scenes. A scene is a physical/lifestyle presentation of the SAME
 * personalized artwork (flat frame, table stand, wall hanging…). Scenes never
 * hold personalization of their own: every scene is rendered from the one
 * PersonalizationState, so changing photo 2 changes it everywhere at once.
 */
export const MockupSceneSchema = z.object({
  id: z.string().min(1),
  /** Template this scene belongs to (scenes are authored per design). */
  templateId: z.string().min(1),
  kind: z.enum(['flat', 'table', 'wall', 'custom']),
  label: z.string().min(1),
  /**
   * Where the artwork lands in the scene photo/PSD: the four corners of the
   * target region as fractions of the scene image, clockwise from top-left.
   * An axis-aligned flat scene has a plain rectangle; table/wall scenes have a
   * perspective quad. Absent => the scene has NOT been prepared for dynamic
   * compositing and must not pretend to be personalized (see sceneReadiness).
   */
  artworkQuad: z.tuple([z.object({ x: fraction, y: fraction }), z.object({ x: fraction, y: fraction }), z.object({ x: fraction, y: fraction }), z.object({ x: fraction, y: fraction })]).optional(),
  /** Base scene with a transparent window where the artwork shows through (or the whole scene if no window). */
  base: AssetRefSchema,
  /** Shadows / glass / reflections laid ABOVE the artwork so the result keeps physical depth. */
  foreground: AssetRefSchema.optional(),
  /** Optional PSD with a smart object named PERSONALIZED_ARTWORK, for the PSD renderer. */
  psd: AssetRefSchema.optional(),
  output: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).default({ width: 1200, height: 1200 }),
});
export type MockupScene = z.infer<typeof MockupSceneSchema>;

export type SceneReadiness = { ready: true } | { ready: false; reason: string };

/**
 * Can this scene honestly show a personalized design? A flattened JPEG with no
 * artwork region can't: pasting a photo on top of it would ignore perspective,
 * frame edges and shadows. Such scenes are reported as needing preparation
 * instead of being rendered inaccurately.
 */
export function sceneReadiness(scene: MockupScene): SceneReadiness {
  if (!scene.artworkQuad) {
    return { ready: false, reason: `Scene "${scene.id}" has no artwork region defined; it needs to be prepared (artwork quad or PSD smart object) before it can show a personalized design.` };
  }
  const [a, b, c, d] = scene.artworkQuad;
  const area = Math.abs((a.x * b.y - b.x * a.y + (b.x * c.y - c.x * b.y) + (c.x * d.y - d.x * c.y) + (d.x * a.y - a.x * d.y)) / 2);
  if (area < 0.001) return { ready: false, reason: `Scene "${scene.id}" artwork region is degenerate (almost zero area).` };
  return { ready: true };
}

/** Everything a renderer receives. Deliberately structured data, never pixels. */
export interface MockupRenderRequest {
  template: PersonalizationTemplate;
  state: PersonalizationState;
  scene: MockupScene;
  /** Cache key: same fingerprint + scene => same picture. */
  fingerprint: string;
}

export type MockupRenderResult =
  | { status: 'ok'; sceneId: string; fingerprint: string; imageUrl: string; renderer: string }
  /** Realistic render failed or the scene isn't prepared; the customer still sees the flat personalized artwork. */
  | { status: 'fallback'; sceneId: string; fingerprint: string; reason: string; renderer: string };

/**
 * Pluggable renderer. Implementations (all optional, all replaceable):
 * local canvas/sharp, a PSD/smart-object renderer, Photoshop API, Dynamic
 * Mockups… The app depends only on this interface, never on a vendor.
 */
export interface MockupRenderer {
  readonly name: string;
  /** Whether this renderer can handle the scene (e.g. PSD renderer needs scene.psd). */
  supports(scene: MockupScene): boolean;
  render(request: MockupRenderRequest): Promise<MockupRenderResult>;
}

export function buildMockupRequest(template: PersonalizationTemplate, state: PersonalizationState, scene: MockupScene): MockupRenderRequest {
  if (state.templateId !== template.id || state.templateVersion !== template.version) {
    throw new Error('Mockup requested for a personalization that does not belong to this template version.');
  }
  if (scene.templateId !== template.id) throw new Error(`Scene "${scene.id}" belongs to a different template.`);
  return { template, state, scene, fingerprint: stateFingerprint(state) };
}

/**
 * Renders every scene from ONE state — the mechanism behind "change photo 2 and
 * all previews update". Each scene tries the first renderer that supports it; a
 * failure or unprepared scene degrades to a fallback result instead of a broken
 * preview, and never blocks the other scenes.
 */
export async function renderAllScenes(
  renderers: readonly MockupRenderer[],
  template: PersonalizationTemplate,
  state: PersonalizationState,
  scenes: readonly MockupScene[]
): Promise<MockupRenderResult[]> {
  const fingerprint = stateFingerprint(state);
  return Promise.all(
    scenes.map(async (scene): Promise<MockupRenderResult> => {
      const readiness = sceneReadiness(scene);
      if (!readiness.ready) return { status: 'fallback', sceneId: scene.id, fingerprint, reason: readiness.reason, renderer: 'none' };
      const renderer = renderers.find((r) => r.supports(scene));
      if (!renderer) return { status: 'fallback', sceneId: scene.id, fingerprint, reason: 'No renderer available for this scene.', renderer: 'none' };
      try {
        return await renderer.render(buildMockupRequest(template, state, scene));
      } catch (err) {
        return { status: 'fallback', sceneId: scene.id, fingerprint, reason: err instanceof Error ? err.message : 'Render failed', renderer: renderer.name };
      }
    })
  );
}

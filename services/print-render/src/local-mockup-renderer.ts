import sharp, { type OverlayOptions } from 'sharp';
import type { MockupRenderer, MockupRenderRequest, MockupRenderResult, MockupScene } from '@bro-pics/shared';
import { renderTemplate, type AssetLoader } from './render-template';
import { warpToQuad, type Quad } from './mockup-warp';

export interface LocalMockupRendererOptions {
  assets: AssetLoader;
  /** Persists a rendered preview and returns where it can be fetched. Cached by (scene, state fingerprint). */
  saveImage(buffer: Buffer, key: string): Promise<string>;
  /** Optional cache lookup: return a URL if this exact (scene, fingerprint) was already rendered. */
  findCached?(key: string): Promise<string | null>;
  /** Longest side, in px, the artwork is rendered at before being warped into the scene. */
  artworkMaxPx?: number;
}

/**
 * Realistic mockups with no vendor dependency: the personalized artwork is rendered from the
 * template + state (the SAME renderer print uses, at preview size), warped onto the scene's
 * perspective quad, and sandwiched between the scene's base photo and its foreground
 * (frame edges, glass, shadows) — so depth, perspective and lighting come from the scene
 * assets rather than being faked by pasting a rectangle on a JPEG.
 *
 * Scenes without an `artworkQuad` are not supported (renderAllScenes reports them as needing
 * preparation instead of calling this).
 */
export class LocalMockupRenderer implements MockupRenderer {
  readonly name = 'local';

  constructor(private readonly options: LocalMockupRendererOptions) {}

  supports(scene: MockupScene): boolean {
    return Boolean(scene.artworkQuad);
  }

  async render(request: MockupRenderRequest): Promise<MockupRenderResult> {
    const { template, state, scene, fingerprint } = request;
    const key = `${scene.templateId}/${scene.id}/${fingerprint}.png`;

    const cached = this.options.findCached ? await this.options.findCached(key) : null;
    if (cached) return { status: 'ok', sceneId: scene.id, fingerprint, imageUrl: cached, renderer: this.name };

    if (!scene.artworkQuad) {
      return { status: 'fallback', sceneId: scene.id, fingerprint, reason: 'Scene has no artwork region.', renderer: this.name };
    }
    const { width, height } = scene.output;

    const maxPx = this.options.artworkMaxPx ?? 1600;
    const artworkScale = Math.min(1, maxPx / Math.max(template.canvas.width, template.canvas.height));
    // The scene's own foreground supplies any physical frame, so the template's preview-only layers stay out.
    const artwork = await renderTemplate({ template, state, assets: this.options.assets, scale: artworkScale, includeUnprinted: false });

    const quad = scene.artworkQuad.map((p) => ({ x: p.x * width, y: p.y * height })) as unknown as Quad;
    const warped = await warpToQuad(artwork, quad, width, height);

    const base = await sharp(await this.options.assets.load(scene.base.assetId), { limitInputPixels: false })
      .resize(width, height, { fit: 'cover' })
      .png()
      .toBuffer();
    const layers: OverlayOptions[] = [{ input: warped, left: 0, top: 0 }];
    if (scene.foreground) {
      layers.push({
        input: await sharp(await this.options.assets.load(scene.foreground.assetId), { limitInputPixels: false })
          .resize(width, height, { fit: 'fill' })
          .png()
          .toBuffer(),
        left: 0,
        top: 0,
      });
    }

    const image = await sharp(base).composite(layers).png().toBuffer();
    const imageUrl = await this.options.saveImage(image, key);
    return { status: 'ok', sceneId: scene.id, fingerprint, imageUrl, renderer: this.name };
  }
}

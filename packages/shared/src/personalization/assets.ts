/**
 * Asset strategy. Six kinds of file, six separate Storage prefixes — never one
 * shared folder — so rules, lifecycle and cleanup can differ per kind:
 *
 *   product/   public    gallery & lifestyle images (NOT personalization templates)
 *   template/  public    fixed artwork of a template version (backgrounds, frames, decorations)
 *   mask/      public    alpha masks for photo slots
 *   upload/    PRIVATE   customer photos (owner + staff only; never world-readable)
 *   mockup/    private   rendered preview scenes (derived, regenerable, cacheable)
 *   render/    private   final print files (production output)
 *
 * IDs are generated server-side. A filename supplied by a client never becomes
 * part of a path (see sanitizeFileStem): it is metadata at most.
 */
export const ASSET_KINDS = ['product', 'template', 'mask', 'upload', 'mockup', 'render'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const PUBLIC_ASSET_KINDS: readonly AssetKind[] = ['product', 'template', 'mask'];

export function isPublicAssetKind(kind: AssetKind): boolean {
  return PUBLIC_ASSET_KINDS.includes(kind);
}

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function segment(value: string, name: string): string {
  if (!SAFE_SEGMENT.test(value)) throw new Error(`Unsafe ${name} for a storage path: ${JSON.stringify(value)}`);
  return value;
}

export interface AssetPathParts {
  kind: AssetKind;
  /** Template id for template/mask assets, product id for product assets, owner id (session or uid) for uploads, order id for renders. */
  scope: string;
  /** Server-generated asset id. */
  assetId: string;
  /** Lower-case extension without dot, from the VERIFIED content type — never from the client's filename. */
  ext: 'jpg' | 'png' | 'webp';
  /** Template version, for template/mask assets (they are versioned together with the template). */
  version?: number;
}

/** Builds the Storage object path for an asset. Throws on anything that could escape its prefix. */
export function assetStoragePath(parts: AssetPathParts): string {
  const scope = segment(parts.scope, 'scope');
  const id = segment(parts.assetId, 'assetId');
  const base = (parts.kind === 'template' || parts.kind === 'mask') && parts.version ? `${scope}/v${parts.version}` : scope;
  const prefix = isPublicAssetKind(parts.kind) ? 'public/' : '';
  return `${prefix}${parts.kind}/${base}/${id}.${parts.ext}`;
}

/** A filename reduced to a safe, short, display-only stem. Never used to build a path. */
export function sanitizeFileStem(filename: string): string {
  const stem = filename.replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return stem.slice(0, 60) || 'file';
}

/** Content types we accept for images, by the bytes' detected type (not the extension/header the client sent). */
export const ACCEPTED_IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;

/** Detects an image type from its leading magic bytes. Returns null for anything else (including corrupt or renamed files). */
export function detectImageType(bytes: Uint8Array): keyof typeof ACCEPTED_IMAGE_TYPES | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

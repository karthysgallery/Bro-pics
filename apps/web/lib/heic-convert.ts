// heic-convert has no published types (see apps/web/types/heic-convert.d.ts
// for the minimal ambient declaration matching its real signature).
//
// No `import 'server-only'` guard here, deliberately — this module is only
// ever imported by image-probe.ts, which itself carries no such guard
// despite being just as server-only in practice (it wraps the native
// `sharp` module). Adding one here would make image-probe.test.ts's real
// (unmocked) fixture tests throw under vitest, for no real safety gain —
// the only caller is already server-only code.
import heicConvert from 'heic-convert';

// ISO base media file format (the container HEIC/HEIF/AVIF all use, same
// family as MP4): bytes 4-7 are the literal ASCII 'ftyp', bytes 8-11 are
// the major brand. Sniffed from real bytes, never trusted from a
// client-supplied filename or Content-Type — same rule the rest of the
// upload pipeline already follows for image format detection.
const HEIC_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs', 'mif1', 'msf1']);

export function isLikelyHeic(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  if (buffer.toString('ascii', 4, 8) !== 'ftyp') return false;
  const brand = buffer.toString('ascii', 8, 12).trim().toLowerCase();
  return HEIC_BRANDS.has(brand);
}

/**
 * Converts a HEIC/HEIF buffer (real iPhone photos, HEVC-encoded) to JPEG.
 * sharp/libvips' own `heif` support is AVIF-only on the prebuilt binaries
 * this project uses — HEVC decode is patent-encumbered and excluded from
 * those builds (confirmed: sharp.format.heif.input.fileSuffix lists only
 * '.avif', never '.heic'/'.heif'). heic-convert wraps libheif-js, a WASM
 * build of libheif that bundles its own HEVC decoder, sidestepping that
 * native-binary licensing gap entirely — the standard, widely-used
 * solution for this exact problem in the Node ecosystem.
 */
export async function convertHeicToJpeg(buffer: Buffer): Promise<Buffer> {
  const output = await heicConvert({ buffer, format: 'JPEG', quality: 0.92 });
  return Buffer.from(output);
}

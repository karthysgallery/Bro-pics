import { artworkDpi, artworkKept, pictureOrientation, sizeLabelOf, type PriceRow } from '@bro-pics/shared';

/** Below this many pixels per inch a print looks soft (the editor's "Too soft" mark). */
export const MIN_SELLABLE_DPI = 150;

const CAMERA_NAME = /^(img|dsc|dscn|dscf|pxl|mvimg|screenshot|image|photo|whatsapp image|pic|picture)[\s_-]*[\d\s_.-]*$/i;

/** "lord_murugan-2 (1).JPG" → "Lord Murugan 2". */
export function nameFromFilename(filename: string): string {
  const base = filename.replace(/\.[A-Za-z0-9]{2,5}$/, '');
  const words = base
    .replace(/\(\d+\)|\bcopy\b/gi, ' ')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return words.toLowerCase().replace(/(^|\s)([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
}

/** A camera or phone file name tells nothing about the picture; the owner is asked to type a name. */
export function looksLikeCameraName(filename: string): boolean {
  return CAMERA_NAME.test(filename.replace(/\.[A-Za-z0-9]{2,5}$/, '').trim());
}

/** Product code like the editor makes: letters and numbers of the name, up to 12. */
export function codeFromName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12).toUpperCase() || 'FRAME';
}

/** The first of base, base-2, base-3… that is not in `taken` (which is not changed). */
export function uniqueWith(base: string, taken: ReadonlySet<string>, join = '-'): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}${join}${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** A product code (12 letters/numbers at most) made unique by a number that still fits. */
export function uniqueCode(base: string, taken: ReadonlySet<string>): string {
  const code = base.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'FRAME';
  if (!taken.has(code)) return code;
  for (let n = 2; ; n++) {
    const tail = String(n);
    const candidate = `${code.slice(0, 12 - tail.length)}${tail}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** The names with a number added to later repeats ("Murugan", "Murugan 2"), compared without caring about case. */
export function dedupeNames(names: string[], existingTitles: ReadonlySet<string> = new Set()): string[] {
  const seen = new Set([...existingTitles].map((t) => t.toLowerCase()));
  return names.map((name) => {
    const clean = name.trim();
    let candidate = clean;
    for (let n = 2; seen.has(candidate.toLowerCase()); n++) candidate = `${clean} ${n}`;
    seen.add(candidate.toLowerCase());
    return candidate;
  });
}

export type Orientation = 'landscape' | 'portrait';

/** The orientation to use: the owner's choice, else the picture's shape; a square picture defaults to landscape. */
export function orientationFor(image: { width: number; height: number }, chosen: Orientation | 'auto'): { orientation: Orientation; square: boolean } {
  const natural = pictureOrientation(image);
  if (chosen !== 'auto') return { orientation: chosen, square: natural === null };
  return { orientation: natural ?? 'landscape', square: natural === null };
}

/**
 * Checks a picture against its size lines: how sharp it prints at the biggest size, how much each shape crops
 * off it, and (when asked) which sizes to leave out because the print would look soft.
 */
export function checkSizes<R extends Pick<PriceRow, 'widthIn' | 'heightIn' | 'isActive'>>(
  image: { width: number; height: number },
  rows: R[],
  options: { dropSoft: boolean; minDpi?: number }
): { rows: R[]; tooSoft: string[]; worstDpi: number | null; keptAtWorst: number | null } {
  const minDpi = options.minDpi ?? MIN_SELLABLE_DPI;
  const tooSoft: string[] = [];
  let worstDpi: number | null = null;
  let keptAtWorst: number | null = null;
  const kept: R[] = [];
  for (const r of rows) {
    const dpi = artworkDpi(image, r);
    const share = artworkKept(image, r);
    if (r.isActive) {
      worstDpi = worstDpi === null ? dpi : Math.min(worstDpi, dpi);
      keptAtWorst = keptAtWorst === null ? share : Math.min(keptAtWorst, share);
    }
    if (options.dropSoft && r.isActive && dpi < minDpi) {
      const label = sizeLabelOf(r.widthIn, r.heightIn).replace(' in', '');
      if (!tooSoft.includes(label)) tooSoft.push(label);
      continue;
    }
    kept.push(r);
  }
  return { rows: kept, tooSoft, worstDpi, keptAtWorst };
}

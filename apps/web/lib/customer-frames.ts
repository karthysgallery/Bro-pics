import manifest from '../public/customer-frames/manifest.json';
import { INSTAGRAM_COMMENTS, type CustomerComment } from './customer-comments';

/** A real photo of a frame KarthysGallery delivered (owner's photos; resized, location data removed). */
export interface CustomerFramePhoto {
  id: string;
  src: string;
  thumb: string;
  width: number;
  height: number;
}

export const CUSTOMER_FRAME_PHOTOS: CustomerFramePhoto[] = (manifest as { id: string; w: number; h: number }[]).map((m) => ({
  id: m.id,
  src: `/customer-frames/${m.id}.webp`,
  thumb: `/customer-frames/${m.id}-sm.webp`,
  width: m.w,
  height: m.h,
}));

/** Comments with something to say (used first in the small card near the price). */
export function featuredComments(min = 45): CustomerComment[] {
  return INSTAGRAM_COMMENTS.filter((c) => c.text.length >= min);
}

/** All comments, the fuller ones first, newest first within that. */
export function allCommentsOrdered(): CustomerComment[] {
  return [...INSTAGRAM_COMMENTS].sort((a, b) => Number(b.text.length >= 45) - Number(a.text.length >= 45) || b.month.localeCompare(a.month));
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** What a review card shows as the person's name: their name from their username, else the username. */
export function displayName(c: CustomerComment): string {
  return c.name ?? c.handle;
}

/**
 * Spotify codes: a text space marked `spotifyCode` holds a Spotify link the customer pasted, and the design shows the
 * scannable code for it (the bars under a song's "Share" sheet) instead of the words.
 *
 * The code picture comes from Spotify's own generator (scannables.scdn.co). It is asked for with white bars on black,
 * then made see-through and recoloured here, so it sits on any design in the space's text colour.
 */

const TYPES = ['track', 'album', 'playlist', 'artist', 'episode', 'show'] as const;
const ID = /^[A-Za-z0-9]{22}$/;

/** A Spotify URI ("spotify:track:<22 chars>") from a pasted link or URI, or null when it is not one. */
export function parseSpotifyLink(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const uri = /^spotify:([a-z]+):([A-Za-z0-9]+)$/.exec(raw);
  if (uri) return (TYPES as readonly string[]).includes(uri[1]) && ID.test(uri[2]) ? `spotify:${uri[1]}:${uri[2]}` : null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.hostname !== 'open.spotify.com') return null;
  // /track/<id>, or /intl-xx/track/<id>, or /embed/track/<id>
  const parts = url.pathname.split('/').filter(Boolean).filter((p) => !/^intl-[a-z]{2}(-[a-z]{2})?$/i.test(p) && p !== 'embed');
  const [type, id] = parts;
  return type && id && (TYPES as readonly string[]).includes(type) && ID.test(id) ? `spotify:${type}:${id}` : null;
}

/** True for a well-formed Spotify URI (what parseSpotifyLink returns). */
export function isSpotifyUri(uri: string): boolean {
  const m = /^spotify:([a-z]+):([A-Za-z0-9]+)$/.exec(uri);
  return Boolean(m && (TYPES as readonly string[]).includes(m[1]) && ID.test(m[2]));
}

/** Where Spotify's generator draws the code for a URI: white bars on black, as SVG. */
export function spotifyScannablesUrl(uri: string): string {
  return `https://scannables.scdn.co/uri/plain/svg/000000/white/640/${uri}`;
}

/** The generator's SVG made see-through (its black backdrop removed) with the logo and bars in `color` (#rrggbb). */
export function spotifyCodeSvg(svg: string, color: string): string {
  const hex = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#000000';
  return svg.replace(/<rect x="0" y="0" width="400" height="100" fill="#000000"\s*\/>/, '').replace(/#ffffff/gi, hex);
}

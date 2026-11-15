import { NextResponse } from 'next/server';
import { isSpotifyUri, spotifyCodeSvg, spotifyScannablesUrl } from '@bro-pics/shared';
import { checkRateLimit } from '../../../lib/rate-limit';

/**
 * The scannable Spotify code for a URI, as a see-through SVG in the asked-for colour, served from this origin so the
 * personalization canvas can draw it (a cross-origin picture would stop the design from being exported).
 * GET /api/spotify-code?uri=spotify:track:<id>&color=%23ffffff
 */
export async function GET(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'image');
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests, please try again shortly' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } });
  }
  const params = new URL(request.url).searchParams;
  const uri = params.get('uri') ?? '';
  const color = params.get('color') ?? '#000000';
  if (!isSpotifyUri(uri)) return NextResponse.json({ error: 'Not a Spotify link' }, { status: 400 });
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return NextResponse.json({ error: 'Invalid colour' }, { status: 400 });

  try {
    const res = await fetch(spotifyScannablesUrl(uri), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return NextResponse.json({ error: 'Spotify could not make a code for this link' }, { status: 502 });
    const svg = spotifyCodeSvg(await res.text(), color);
    return new NextResponse(svg, {
      status: 200,
      // A URI's code never changes.
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
  } catch {
    return NextResponse.json({ error: 'Spotify did not answer, please try again' }, { status: 502 });
  }
}

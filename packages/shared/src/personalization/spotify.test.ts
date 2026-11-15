import { describe, expect, it } from 'vitest';
import { isSpotifyUri, parseSpotifyLink, spotifyCodeSvg, spotifyScannablesUrl } from './spotify';

const ID = '0tgVpDi06FyKpA1z0VMD4v';

describe('parseSpotifyLink', () => {
  it('reads the link from Spotify’s Share > Copy link, with or without tracking and country parts', () => {
    expect(parseSpotifyLink(`https://open.spotify.com/track/${ID}?si=abc123`)).toBe(`spotify:track:${ID}`);
    expect(parseSpotifyLink(`https://open.spotify.com/intl-ta/track/${ID}`)).toBe(`spotify:track:${ID}`);
    expect(parseSpotifyLink(`open.spotify.com/album/${ID}`)).toBe(`spotify:album:${ID}`);
    expect(parseSpotifyLink(`  https://open.spotify.com/playlist/${ID}  `)).toBe(`spotify:playlist:${ID}`);
  });

  it('accepts a Spotify URI as it is', () => {
    expect(parseSpotifyLink(`spotify:track:${ID}`)).toBe(`spotify:track:${ID}`);
  });

  it('rejects anything that is not a Spotify link', () => {
    expect(parseSpotifyLink('')).toBeNull();
    expect(parseSpotifyLink('Perfect by Ed Sheeran')).toBeNull();
    expect(parseSpotifyLink(`https://example.com/track/${ID}`)).toBeNull();
    expect(parseSpotifyLink('https://open.spotify.com/track/short')).toBeNull();
    expect(parseSpotifyLink(`https://open.spotify.com/user/${ID}`)).toBeNull();
    expect(parseSpotifyLink(`spotify:user:${ID}`)).toBeNull();
  });
});

describe('Spotify code picture', () => {
  it('asks Spotify for white bars on black and only for well-formed URIs', () => {
    expect(isSpotifyUri(`spotify:track:${ID}`)).toBe(true);
    expect(isSpotifyUri('spotify:track:../../x')).toBe(false);
    expect(spotifyScannablesUrl(`spotify:track:${ID}`)).toBe(`https://scannables.scdn.co/uri/plain/svg/000000/white/640/spotify:track:${ID}`);
  });

  it('removes the black backdrop and recolours the logo and bars', () => {
    const svg = '<svg><rect x="0" y="0" width="400" height="100" fill="#000000"/><rect fill="#ffffff"/><path fill="#ffffff"/></svg>';
    const out = spotifyCodeSvg(svg, '#c8a26b');
    expect(out).not.toContain('#000000');
    expect(out).not.toContain('#ffffff');
    expect(out.match(/#c8a26b/g)).toHaveLength(2);
    // An invalid colour falls back to black bars rather than injecting anything into the SVG.
    expect(spotifyCodeSvg(svg, 'red" onload="x')).not.toContain('onload');
  });
});

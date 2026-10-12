import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('server-only', () => ({}));
import { cleanQuery, isPexelsPhotoUrl, searchStockPhotos, StockPhotosError } from './stock-photos';

describe('stock photos', () => {
  beforeEach(() => { process.env.PEXELS_API_KEY = 'k'; });
  afterEach(() => { delete process.env.PEXELS_API_KEY; });

  it('tidies the search words', () => {
    expect(cleanQuery('  cute   baby!! <script> ')).toBe('cute baby script');
    expect(cleanQuery(null)).toBe('');
  });
  it('allows only https Pexels picture addresses', () => {
    expect(isPexelsPhotoUrl('https://images.pexels.com/photos/1/pexels-photo-1.jpeg?w=1600')).toBe(true);
    expect(isPexelsPhotoUrl('http://images.pexels.com/photos/1/a.jpeg')).toBe(false);
    expect(isPexelsPhotoUrl('https://images.pexels.com.evil.com/a.jpeg')).toBe(false);
    expect(isPexelsPhotoUrl('https://evil.com/images.pexels.com')).toBe(false);
    expect(isPexelsPhotoUrl('https://user:pw@images.pexels.com/a.jpeg')).toBe(false);
    expect(isPexelsPhotoUrl('http://169.254.169.254/')).toBe(false);
  });
  it('says plainly when the key is missing or the words are too short', async () => {
    delete process.env.PEXELS_API_KEY;
    await expect(searchStockPhotos('child')).rejects.toMatchObject({ status: 503 });
    process.env.PEXELS_API_KEY = 'k';
    await expect(searchStockPhotos('a')).rejects.toBeInstanceOf(StockPhotosError);
  });
  it('searches Pexels with the key and maps the pictures', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ photos: [{ id: 7, width: 4000, height: 6000, url: 'https://www.pexels.com/photo/7/', photographer: 'Asha', photographer_url: 'https://www.pexels.com/@asha', alt: 'A child', src: { large: 'L', large2x: 'L2', medium: 'M', small: 'S' } }] }), { status: 200 }));
    const out = await searchStockPhotos('child', { orientation: 'portrait' }, fetchImpl as unknown as typeof fetch);
    expect(String(fetchImpl.mock.calls[0]![0])).toContain('query=child');
    expect(String(fetchImpl.mock.calls[0]![0])).toContain('orientation=portrait');
    expect(fetchImpl.mock.calls[0]![1].headers.Authorization).toBe('k');
    expect(out).toEqual([{ id: 7, alt: 'A child', thumb: 'M', full: 'L2', photographer: 'Asha', photographerUrl: 'https://www.pexels.com/@asha', pageUrl: 'https://www.pexels.com/photo/7/', width: 4000, height: 6000 }]);
  });
  it('reports a busy or failing service in plain words', async () => {
    await expect(searchStockPhotos('child', {}, vi.fn().mockResolvedValue(new Response('', { status: 429 })) as unknown as typeof fetch)).rejects.toMatchObject({ status: 429 });
    await expect(searchStockPhotos('child', {}, vi.fn().mockResolvedValue(new Response('', { status: 500 })) as unknown as typeof fetch)).rejects.toMatchObject({ status: 502 });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('server-only', () => ({}));
import { fetchStockPhoto, shortTags, cleanQuery, isStockPhotoUrl as isPexelsPhotoUrl, searchStockPhotos, StockPhotosError } from './stock-photos';

describe('stock photos', () => {
  beforeEach(() => { process.env.PEXELS_API_KEY = 'k'; });
  afterEach(() => { delete process.env.PEXELS_API_KEY; delete process.env.PIXABAY_API_KEY; });

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
    expect(isPexelsPhotoUrl('https://cdn.pixabay.com/photo/2020/01/01/00/00/x-1_1280.jpg')).toBe(true);
    expect(isPexelsPhotoUrl('https://pixabay.com/get/abc.jpg')).toBe(true);
    expect(isPexelsPhotoUrl('https://pixabay.com.evil.com/a.jpg')).toBe(false);
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
    expect(out).toEqual([{ id: 7, provider: 'pexels', alt: 'A child', thumb: 'M', full: 'L2', photographer: 'Asha', photographerUrl: 'https://www.pexels.com/@asha', pageUrl: 'https://www.pexels.com/photo/7/', width: 4000, height: 6000 }]);
  });
  it('reports a busy or failing service in plain words', async () => {
    await expect(searchStockPhotos('child', {}, vi.fn().mockResolvedValue(new Response('', { status: 429 })) as unknown as typeof fetch)).rejects.toMatchObject({ status: 429 });
    await expect(searchStockPhotos('child', {}, vi.fn().mockResolvedValue(new Response('', { status: 500 })) as unknown as typeof fetch)).rejects.toMatchObject({ status: 502 });
  });

  it('prefers Pixabay when its key is set, searches it, and maps the pictures', async () => {
    process.env.PIXABAY_API_KEY = 'pk';
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ hits: [{ id: 9, pageURL: 'https://pixabay.com/photos/9/', tags: 'child, girl', previewURL: 'P', webformatURL: 'W', largeImageURL: 'L', imageWidth: 3000, imageHeight: 4000, user: 'Asha K', user_id: 55 }] }), { status: 200 }));
    const out = await searchStockPhotos('child', { orientation: 'portrait' }, fetchImpl as unknown as typeof fetch);
    const url = String(fetchImpl.mock.calls[0]![0]);
    expect(url.startsWith('https://pixabay.com/api/?')).toBe(true);
    expect(url).toContain('key=pk');
    expect(url).toContain('q=child');
    expect(url).toContain('orientation=vertical');
    expect(url).toContain('safesearch=true');
    expect(out).toEqual([{ id: 9, provider: 'pixabay', alt: 'child, girl', thumb: 'W', full: 'L', photographer: 'Asha K', photographerUrl: 'https://pixabay.com/users/Asha%20K-55/', pageUrl: 'https://pixabay.com/photos/9/', width: 3000, height: 4000 }]);
  });

  it('shortens Pixabay’s long, repeating tag lists', () => {
    expect(shortTags('baby, newborn, baby, baby, father, people, monochrome')).toBe('baby, newborn, father, people');
    expect(shortTags(undefined)).toBe('');
  });

  describe('fetchStockPhoto', () => {
    const img = (type = 'image/jpeg') => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': type } });
    const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });

    it('follows the stock site’s own redirect to its image host', async () => {
      const f = vi.fn().mockResolvedValueOnce(redirect('https://cdn.pixabay.com/photo/2020/a_1280.jpg')).mockResolvedValueOnce(img());
      const out = await fetchStockPhoto('https://pixabay.com/get/abc_1280.jpg', { fetchImpl: f as unknown as typeof fetch });
      expect(out.type).toBe('image/jpeg');
      expect(out.bytes.length).toBe(3);
      expect(f.mock.calls.map((c) => String(c[0]))).toEqual(['https://pixabay.com/get/abc_1280.jpg', 'https://cdn.pixabay.com/photo/2020/a_1280.jpg']);
      expect(f.mock.calls[0]![1].redirect).toBe('manual');
    });
    it('refuses a redirect to any other server', async () => {
      const f = vi.fn().mockResolvedValueOnce(redirect('http://169.254.169.254/latest/meta-data'));
      await expect(fetchStockPhoto('https://pixabay.com/get/abc.jpg', { fetchImpl: f as unknown as typeof fetch })).rejects.toMatchObject({ status: 400 });
      expect(f).toHaveBeenCalledTimes(1);
    });
    it('refuses a start address that is not a stock photo host, a non-image answer, a redirect loop and a huge file', async () => {
      const none = vi.fn();
      await expect(fetchStockPhoto('https://evil.com/a.jpg', { fetchImpl: none as unknown as typeof fetch })).rejects.toMatchObject({ status: 400 });
      expect(none).not.toHaveBeenCalled();
      await expect(fetchStockPhoto('https://pixabay.com/get/a', { fetchImpl: vi.fn().mockResolvedValue(new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch })).rejects.toMatchObject({ status: 502 });
      await expect(fetchStockPhoto('https://pixabay.com/get/a', { fetchImpl: vi.fn().mockImplementation(async () => redirect('https://pixabay.com/get/a')) as unknown as typeof fetch })).rejects.toMatchObject({ status: 502 });
      await expect(fetchStockPhoto('https://pixabay.com/get/a', { maxBytes: 2, fetchImpl: vi.fn().mockResolvedValue(img()) as unknown as typeof fetch })).rejects.toMatchObject({ status: 413 });
    });
  });
});

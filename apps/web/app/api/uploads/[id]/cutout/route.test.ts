// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockDocGet = vi.fn();
vi.mock('../../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn() }));
vi.mock('../../../../../lib/verify-id-token', () => ({ getUserIdFromAuthHeader: vi.fn().mockResolvedValue(null) }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => ({ collection: () => ({ doc: () => ({ get: mockDocGet }) }) }) }));

import { POST } from './route';
import { resetRateLimitState } from '../../../../../lib/rate-limit';

const upload = { id: 'up_1', sessionId: 'sess_1', originalPath: 'uploads/sess_1/up_1/original.jpg', widthPx: 2400, heightPx: 3600, status: 'ready' };
const call = (sessionId = 'sess_1') =>
  POST(new Request('http://localhost/api/uploads/up_1/cutout', { method: 'POST', headers: { 'X-Session-Id': sessionId } }), { params: Promise.resolve({ id: 'up_1' }) });

describe('POST /api/uploads/[id]/cutout', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    resetRateLimitState();
    mockDocGet.mockResolvedValue({ exists: true, data: () => upload });
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('CUTOUT_SERVICE_URL', 'http://localhost:8282');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('asks the cut-out service (no token for a local one) and returns the new upload', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ uploadId: 'cut_1', widthPx: 2400, heightPx: 3600, reused: false }), { status: 200 }));
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ uploadId: 'cut_1', widthPx: 2400, heightPx: 3600 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:8282/cutout/up_1');
    expect((init as RequestInit).headers).not.toHaveProperty('Authorization');
  });

  it("refuses someone else's photo without calling the service", async () => {
    expect((await call('other')).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes on "nobody in the photo", and turns other failures or a missing service into clear errors', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'no_subject', error: 'No people were found.' }), { status: 422 }));
    expect(await (await call()).json()).toMatchObject({ code: 'no_subject' });
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    expect((await call()).status).toBe(502);
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect((await call()).status).toBe(502);
    vi.stubEnv('CUTOUT_SERVICE_URL', '');
    vi.stubEnv('PRINT_RENDER_URL', '');
    expect((await call()).status).toBe(503);
  });

  it('gets an identity token for a deployed (private) service', async () => {
    vi.stubEnv('CUTOUT_SERVICE_URL', 'https://print-render-abc.a.run.app/');
    fetchMock
      .mockResolvedValueOnce(new Response('id-token', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ uploadId: 'cut_1', widthPx: 1, heightPx: 1 }), { status: 200 }));
    expect((await call()).status).toBe(200);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('metadata.google.internal');
    expect(String(fetchMock.mock.calls[0]![0])).toContain(encodeURIComponent('https://print-render-abc.a.run.app'));
    expect((fetchMock.mock.calls[1]![1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer id-token' });
  });
});

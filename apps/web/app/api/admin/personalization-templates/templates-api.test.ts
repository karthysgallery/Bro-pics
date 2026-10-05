import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({})) }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => ({}) }));
vi.mock('../../../../lib/audit-log', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));

const mockPermission = vi.hoisted(() => vi.fn());
vi.mock('../../../../lib/require-permission', () => ({ requirePermission: (...a: unknown[]) => mockPermission(...a) }));

const store = vi.hoisted(() => ({
  listTemplateSummaries: vi.fn(),
  createDraft: vi.fn(),
  listVersions: vi.fn(),
  getTemplateVersion: vi.fn(),
  saveDraft: vi.fn(),
  transitionStatus: vi.fn(),
}));
vi.mock('../../../../lib/personalization-templates', async () => {
  const actual = await vi.importActual<typeof import('../../../../lib/personalization-templates')>('../../../../lib/personalization-templates');
  return { ...actual, ...store };
});
vi.mock('../../../../lib/personalization-template-http', async () => {
  const actual = await vi.importActual<typeof import('../../../../lib/personalization-template-http')>('../../../../lib/personalization-template-http');
  return { ...actual, buildAssetExists: vi.fn().mockResolvedValue(() => true) };
});

import { GET as listGet, POST as createPost } from './route';
import { GET as versionsGet } from './[id]/route';
import { GET as versionGet, PUT as versionPut } from './[id]/versions/[version]/route';
import { POST as statusPost } from './[id]/versions/[version]/status/route';
import { TemplateNotFoundError, TemplateStateError } from '../../../../lib/personalization-templates';
import { resetRateLimitState } from '../../../../lib/rate-limit';

const req = (body?: unknown, method = 'POST') =>
  new Request('https://example.com/api/admin/personalization-templates', { method, headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (id = 't1', version = '1') => ({ params: Promise.resolve({ id, version }) });

describe('admin personalization-templates API', () => {
  beforeEach(() => {
    resetRateLimitState();
    vi.clearAllMocks();
    mockPermission.mockResolvedValue({ ok: true, uid: 'admin_1' });
  });

  it('denies every endpoint without the catalogue permission', async () => {
    mockPermission.mockResolvedValue({ ok: false, status: 403 });
    expect((await listGet(req(undefined, 'GET'))).status).toBe(403);
    expect((await createPost(req({}))).status).toBe(403);
    expect((await versionsGet(req(undefined, 'GET'), params())).status).toBe(403);
    expect((await versionGet(req(undefined, 'GET'), params())).status).toBe(403);
    expect((await versionPut(req({}, 'PUT'), params())).status).toBe(403);
    expect((await statusPost(req({ to: 'review' }), params())).status).toBe(403);
    expect(store.createDraft).not.toHaveBeenCalled();
    mockPermission.mockResolvedValue({ ok: false, status: 401 });
    expect((await listGet(req(undefined, 'GET'))).status).toBe(401);
  });

  it('lists summaries and creates a draft (201)', async () => {
    store.listTemplateSummaries.mockResolvedValue([{ id: 't1' }]);
    expect(await (await listGet(req(undefined, 'GET'))).json()).toEqual({ templates: [{ id: 't1' }] });
    store.createDraft.mockResolvedValue({ id: 't1', version: 1, type: 'collage', photoSlots: [] });
    const res = await createPost(req({ id: 't1' }));
    expect(res.status).toBe(201);
  });

  it('maps store errors: invalid body -> 409/422, missing -> 404, immutable -> 409', async () => {
    store.createDraft.mockRejectedValue(new TemplateStateError('bad'));
    expect((await createPost(req({}))).status).toBe(409);
    store.saveDraft.mockRejectedValue(new TemplateStateError('published and can no longer be edited'));
    expect((await versionPut(req({}, 'PUT'), params())).status).toBe(409);
    store.saveDraft.mockRejectedValue(new TemplateNotFoundError('nope'));
    expect((await versionPut(req({}, 'PUT'), params())).status).toBe(404);
    store.getTemplateVersion.mockResolvedValue(null);
    expect((await versionGet(req(undefined, 'GET'), params())).status).toBe(404);
  });

  it('rejects a non-numeric or zero version', async () => {
    expect((await versionGet(req(undefined, 'GET'), params('t1', 'abc'))).status).toBe(400);
    expect((await versionPut(req({}, 'PUT'), params('t1', '0'))).status).toBe(400);
    expect((await statusPost(req({ to: 'review' }), params('t1', '-1'))).status).toBe(400);
  });

  it('PUBLISHING requires catalogue:publish; other transitions only catalogue:write', async () => {
    store.getTemplateVersion.mockResolvedValue({ id: 't1', version: 1, layers: [], photoSlots: [] });
    store.transitionStatus.mockResolvedValue({ id: 't1', version: 1, status: 'published' });
    await statusPost(req({ to: 'published' }), params());
    expect(mockPermission).toHaveBeenLastCalledWith(expect.anything(), 'catalogue:publish');
    await statusPost(req({ to: 'review' }), params());
    expect(mockPermission).toHaveBeenLastCalledWith(expect.anything(), 'catalogue:write');
  });

  it('a publish that fails validation is a 422 with the readable reason; an illegal transition is a 409', async () => {
    store.getTemplateVersion.mockResolvedValue({ id: 't1', version: 1, layers: [], photoSlots: [] });
    store.transitionStatus.mockRejectedValueOnce(new Error('Template cannot be published:\n- Photo slot "a" is not in the layer stack'));
    const res = await statusPost(req({ to: 'published' }), params());
    expect(res.status).toBe(422);
    expect(JSON.stringify(await res.json())).toMatch(/not in the layer stack/);
    store.transitionStatus.mockRejectedValueOnce(new TemplateStateError('Cannot move t1@v1 from published to draft.'));
    expect((await statusPost(req({ to: 'draft' }), params())).status).toBe(409);
  });

  it('rejects a body without a valid target status', async () => {
    expect((await statusPost(req({ to: 'live' }), params())).status).toBe(400);
    expect((await statusPost(req({}), params())).status).toBe(400);
  });
});

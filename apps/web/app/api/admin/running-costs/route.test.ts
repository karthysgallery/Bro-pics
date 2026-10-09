// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));
const mockGet = vi.hoisted(() => vi.fn());
const mockMonths = vi.hoisted(() => vi.fn());
vi.mock('../../../../lib/firebase-admin', () => ({ getAdminApp: vi.fn(() => ({ options: { credential: { getAccessToken: async () => ({ access_token: 'tok' }) } } })) }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: () => ({ doc: () => ({ get: mockGet, collection: () => ({ get: mockMonths }) }) }) }),
}));
const mockPermission = vi.hoisted(() => vi.fn());
vi.mock('../../../../lib/require-permission', () => ({ requirePermission: (...a: unknown[]) => mockPermission(...a) }));

import { GET } from './route';
import { resetRunningCostsCache, billingExportTable } from '../../../../lib/running-costs';
import { resetRateLimitState } from '../../../../lib/rate-limit';

const req = (q = '') => new Request(`http://localhost/api/admin/running-costs${q}`, { headers: { Authorization: 'Bearer t' } });
const budget = { budgetName: 'Website', currency: 'INR', costAmount: 47, budgetAmount: 1000, periodStart: '2026-09-30T18:30:00Z', month: '2026-10', updatedAt: '2026-10-09T04:00:00Z' };

describe('GET /api/admin/running-costs', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-09T05:00:00Z'));
    resetRunningCostsCache();
    resetRateLimitState();
    mockPermission.mockResolvedValue({ ok: true, uid: 'owner' });
    mockGet.mockResolvedValue({ exists: true, data: () => ({ budget }) });
    mockMonths.mockResolvedValue({ docs: [{ data: () => ({ month: '2026-09', amount: 61 }) }] });
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('is for the owner and admins only', async () => {
    mockPermission.mockResolvedValue({ ok: false, status: 403 });
    expect((await GET(req())).status).toBe(403);
  });

  it("shows the budget's month-to-date total when only budget alerts are set up", async () => {
    const body = await (await GET(req())).json();
    expect(body).toMatchObject({ monthToDate: 47, monthToDateSource: 'budget', currency: 'INR', budgetConfigured: true, exportConfigured: false });
    expect(body.months).toEqual([
      { month: '2026-09', amount: 61 },
      { month: '2026-10', amount: 47 },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('adds the per-service detail from the billing export, querying only this project', async () => {
    vi.stubEnv('BILLING_EXPORT_TABLE', 'bropics-app.billing.gcp_billing_export_v1_ABC');
    vi.stubEnv('BILLING_PROJECT_ID', 'bropics-app');
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ jobComplete: true, rows: [{ f: [{ v: '2026-10' }, { v: '2026-10-08' }, { v: 'Cloud Run' }, { v: 'INR' }, { v: '12.5' }] }] }), { status: 200 })
    );
    const body = await (await GET(req())).json();
    expect(body.byService).toEqual([{ service: 'Cloud Run', label: 'Website', purpose: expect.any(String), amount: 12.5 }]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://bigquery.googleapis.com/bigquery/v2/projects/bropics-app/queries');
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.queryParameters[0].parameterValue.value).toBe('bropics-app');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' });
  });

  it('still shows the budget figure when the export cannot be read, with the reason', async () => {
    vi.stubEnv('BILLING_EXPORT_TABLE', 'bropics-app.billing.gcp_billing_export_v1_ABC');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Access Denied' } }), { status: 403 }));
    const body = await (await GET(req('?fresh=1'))).json();
    expect(body.monthToDate).toBe(47);
    expect(body.exportConfigured).toBe(true);
    expect(body.exportError).toMatch(/Access Denied/);
  });

  it('ignores a table setting that is not a plain project.dataset.table name (nothing odd reaches the query)', async () => {
    vi.stubEnv('BILLING_EXPORT_TABLE', 'x.y.z`; DROP TABLE a; --');
    expect(billingExportTable()).toBeNull();
    const body = await (await GET(req('?fresh=1'))).json();
    expect(body.exportConfigured).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

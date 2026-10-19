import { describe, it, expect, vi, beforeEach } from 'vitest';

const guardMock = vi.hoisted(() => vi.fn());
const buildPlan = vi.hoisted(() => vi.fn());
const commitImport = vi.hoisted(() => vi.fn());
const audit = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const optOut = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const suppressed = vi.hoisted(() => vi.fn().mockResolvedValue(false));
const customerDoc = vi.hoisted(() => ({ exists: true, data: () => ({ phone: '+919876543210', consent: { marketing: { status: 'unknown' } } }) }));
const update = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('server-only', () => ({}));
vi.mock('../../../../../lib/billing/server', () => ({
  guard: (...a: unknown[]) => guardMock(...a),
  billingDb: () => ({ collection: () => ({ doc: () => ({ get: async () => customerDoc, update }) }) }),
}));
vi.mock('../../../../../lib/audit-log', () => ({ writeAuditLog: audit }));
vi.mock('@bro-pics/shared/src/whatsapp/contact-import-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@bro-pics/shared/src/whatsapp/contact-import-service')>();
  return { ...actual, buildPlan, commitImport };
});
vi.mock('@bro-pics/shared/src/whatsapp/consent', () => ({ isSuppressed: suppressed, recordMarketingOptOut: optOut }));

import { POST as importPOST } from './import/route';
import { GET as templateGET } from './template/route';
import { PUT as consentPUT } from './[id]/consent/route';
import { PlanChangedError } from '@bro-pics/shared/src/whatsapp/contact-import-service';

const denied = (status: number) => ({ ok: false, response: new Response(JSON.stringify({ error: 'no' }), { status }) });
const allowed = { ok: true, uid: 'admin_1', role: 'admin', can: () => true };
const req = (body: unknown, url = 'https://example.com/api/admin/whatsapp/contacts/import') => new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const planSummaryInput = { csv: 'name,phone\nA,9876543210\n', strategy: 'skip_existing' };

describe('contact import route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guardMock.mockResolvedValue(allowed);
    buildPlan.mockResolvedValue({ strategy: 'skip_existing', rows: [], issues: [], headerProblems: [], counts: { rowsInFile: 1, create: 1, update: 0, unchanged: 0, skipExisting: 0, duplicateInFile: 0, invalid: 0, consentOptedIn: 0, consentUnknown: 1, consentOptedOut: 0, suppressedKept: 0 } });
  });

  it('asks for the import permission and refuses everyone else without reading the file', async () => {
    guardMock.mockResolvedValue(denied(403));
    expect((await importPOST(req(planSummaryInput))).status).toBe(403);
    expect(guardMock).toHaveBeenCalledWith(expect.anything(), 'whatsapp:contacts_import');
    expect(buildPlan).not.toHaveBeenCalled();
    expect(commitImport).not.toHaveBeenCalled();
  });

  it('a dry run returns the plan and writes nothing', async () => {
    const res = await importPOST(req(planSummaryInput));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.dryRun).toBe(true);
    expect(json.plan.counts.create).toBe(1);
    expect(commitImport).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('a real import needs the counts from the preview', async () => {
    expect((await importPOST(req({ ...planSummaryInput, commit: true }))).status).toBe(400);
    expect(commitImport).not.toHaveBeenCalled();
  });

  it('a real import writes through the shared service, audits counts only, and returns the result', async () => {
    commitImport.mockResolvedValue({ importId: 'imp1', created: 1, updated: 0, skipped: 0, plan: { counts: { create: 1 } } });
    const res = await importPOST(req({ ...planSummaryInput, commit: true, expect: { create: 1, update: 0 } }));
    expect(res.status).toBe(200);
    expect(commitImport).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ actorUid: 'admin_1', expect: { create: 1, update: 0 } }));
    const details = JSON.stringify(audit.mock.calls[0][1]);
    expect(details).toContain('whatsapp.contacts_import');
    expect(details).not.toMatch(/9876543210|csv/);
  });

  it('a changed database since the preview is a 409 and nothing is reported as imported', async () => {
    commitImport.mockRejectedValue(new PlanChangedError());
    const res = await importPOST(req({ ...planSummaryInput, commit: true, expect: { create: 1, update: 0 } }));
    expect(res.status).toBe(409);
  });

  it('rejects a body with no csv, an unknown strategy, and binary content', async () => {
    expect((await importPOST(req({}))).status).toBe(400);
    expect((await importPOST(req({ ...planSummaryInput, strategy: 'delete_everything' }))).status).toBe(400);
    buildPlan.mockRejectedValue(Object.assign(new Error('binary'), { name: 'ImportFileError' }));
    const { ImportFileError } = await import('@bro-pics/shared');
    buildPlan.mockRejectedValue(new ImportFileError('This does not look like a CSV text file'));
    expect((await importPOST(req({ csv: 'PK\u0000', strategy: 'skip_existing' }))).status).toBe(400);
  });

  it('the template needs the same permission', async () => {
    guardMock.mockResolvedValue(denied(401));
    expect((await templateGET(new Request('https://example.com/x'))).status).toBe(401);
    guardMock.mockResolvedValue(allowed);
    const res = await templateGET(new Request('https://example.com/x'));
    expect(res.headers.get('content-type')).toMatch(/text\/csv/);
    expect(await res.text()).toMatch(/^name,phone,email/);
  });
});

describe('consent route', () => {
  const put = (body: unknown, id = 'p919876543210') => consentPUT(new Request('https://example.com/x', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
  beforeEach(() => {
    vi.clearAllMocks();
    guardMock.mockResolvedValue(allowed);
    suppressed.mockResolvedValue(false);
  });

  it('needs whatsapp:consent_edit', async () => {
    guardMock.mockResolvedValue(denied(403));
    expect((await put({ marketing: 'opted_in', source: 'form', evidence: 'F1' })).status).toBe(403);
    expect(guardMock).toHaveBeenCalledWith(expect.anything(), 'whatsapp:consent_edit');
    expect(update).not.toHaveBeenCalled();
  });

  it('marketing permission needs a source AND evidence', async () => {
    expect((await put({ marketing: 'opted_in', source: 'form' })).status).toBe(400);
    expect((await put({ marketing: 'opted_in', evidence: 'F1' })).status).toBe(400);
    expect(update).not.toHaveBeenCalled();
    expect((await put({ marketing: 'opted_in', source: 'signed sheet', evidence: 'Sheet 4 row 12' })).status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ 'consent.marketing': expect.objectContaining({ status: 'opted_in', evidence: 'Sheet 4 row 12' }) }));
  });

  it('staff cannot opt a suppressed or opted-out person back in', async () => {
    suppressed.mockResolvedValue(true);
    const res = await put({ marketing: 'opted_in', source: 'phone call', evidence: 'Spoke on 18 Oct' });
    expect(res.status).toBe(409);
    expect(update).not.toHaveBeenCalled();
  });

  it('an opt-out goes through the suppression path', async () => {
    expect((await put({ marketing: 'opted_out', source: 'phone call' })).status).toBe(200);
    expect(optOut).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ phone: '+919876543210' }));
  });

  it('rejects a malformed id and an unknown status', async () => {
    expect((await put({ marketing: 'opted_in', source: 'x', evidence: 'y' }, 'not-an-id')).status).toBe(400);
    expect((await put({ marketing: 'unknown', source: 'x' })).status).toBe(400);
  });
});

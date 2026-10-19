import { describe, it, expect, vi, beforeEach } from 'vitest';

const guardMock = vi.hoisted(() => vi.fn());
const campaignData = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));
const selectAudience = vi.hoisted(() => vi.fn());
const startCampaign = vi.hoisted(() => vi.fn());
const sendCampaignBatch = vi.hoisted(() => vi.fn());
const templateProblem = vi.hoisted(() => vi.fn());
const waMode = vi.hoisted(() => ({ mode: 'cloud' }));
const update = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const recipients = vi.hoisted(() => ({ docs: [] as Array<{ get: (k: string) => unknown }>, size: 0 }));
const audit = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('server-only', () => ({}));
vi.mock('../../../../../lib/billing/server', () => ({
  guard: (...a: unknown[]) => guardMock(...a),
  whatsappService: () => ({ mode: waMode.mode }),
  billingDb: () => ({
    collection: () => ({
      doc: () => ({ get: async () => ({ exists: campaignData.value !== null, data: () => campaignData.value }), update, collection: () => ({ limit: () => ({ get: async () => recipients }), where: () => ({ get: async () => ({ docs: [], size: 0, empty: true }) }) }) }),
    }),
    batch: () => ({ update: vi.fn(), commit: vi.fn() }),
  }),
}));
vi.mock('../../../../../lib/audit-log', () => ({ writeAuditLog: audit }));
vi.mock('@bro-pics/shared/src/whatsapp/campaigns', () => ({ selectAudience, startCampaign, sendCampaignBatch, requeueFailedRecipients: vi.fn().mockResolvedValue(2), cancelCampaignRecipients: vi.fn().mockResolvedValue(3) }));
vi.mock('@bro-pics/shared/src/whatsapp/template-registry', () => ({ marketingTemplateProblem: templateProblem }));

import { POST as sendPOST } from './[id]/send/route';
import { PATCH } from './[id]/route';
import { GET as reportGET } from './[id]/report/route';

const ctx = { params: Promise.resolve({ id: 'c1' }) };
const admin = { ok: true, uid: 'admin_1', role: 'admin', can: () => true };
const marketer = { ok: true, uid: 'm1', role: 'marketing_manager', can: (k: string) => k === 'marketing:whatsapp' };
const denied = (status: number) => ({ ok: false, response: new Response('{}', { status }) });
const draft = { id: 'c1', name: 'Diwali', status: 'draft', template: 'karthys_festival_offer', language: 'en', audience: { type: 'all_opted_in' }, counts: { targeted: 0, sent: 0, delivered: 0, read: 0, failed: 0, optedOut: 0 }, scheduledAt: null };
const sendReq = (body: unknown = {}) => new Request('https://example.com/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const patchReq = (body: unknown) => new Request('https://example.com/x', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  guardMock.mockResolvedValue(admin);
  campaignData.value = { ...draft };
  waMode.mode = 'cloud';
  templateProblem.mockResolvedValue(null);
  selectAudience.mockResolvedValue({ recipients: Array(5).fill({}), optedOut: 1, exclusions: {} });
  startCampaign.mockResolvedValue(5);
  sendCampaignBatch.mockResolvedValue({ sent: 5, skipped: 0, failed: 0, done: true });
});

describe('sending a campaign', () => {
  it('needs whatsapp:campaign_send: the marketing role is refused and nothing starts', async () => {
    guardMock.mockResolvedValue(denied(403));
    expect((await sendPOST(sendReq({ confirmAudience: 5 }), ctx)).status).toBe(403);
    expect(guardMock).toHaveBeenCalledWith(expect.anything(), 'whatsapp:campaign_send');
    expect(startCampaign).not.toHaveBeenCalled();
  });

  it('refuses while WhatsApp is switched off, freezing nothing', async () => {
    waMode.mode = 'disabled';
    const res = await sendPOST(sendReq({ confirmAudience: 5 }), ctx);
    expect(res.status).toBe(409);
    expect(startCampaign).not.toHaveBeenCalled();
  });

  it('refuses a template nobody has recorded as approved', async () => {
    templateProblem.mockResolvedValue('The template has not been recorded as approved.');
    const res = await sendPOST(sendReq({ confirmAudience: 5 }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('template_not_approved');
    expect(startCampaign).not.toHaveBeenCalled();
  });

  it('needs the administrator to confirm the audience size, and refuses a stale number', async () => {
    const missing = await sendPOST(sendReq({}), ctx);
    expect(missing.status).toBe(409);
    expect((await missing.json()).error.code).toBe('confirmation_required');
    const stale = await sendPOST(sendReq({ confirmAudience: 9 }), ctx);
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.code).toBe('audience_changed');
    expect(startCampaign).not.toHaveBeenCalled();
  });

  it('with the right confirmation it starts, sends the first batch and audits', async () => {
    const res = await sendPOST(sendReq({ confirmAudience: 5 }), ctx);
    expect(res.status).toBe(200);
    expect(startCampaign).toHaveBeenCalledTimes(1);
    expect(sendCampaignBatch).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'marketing.campaign_sent' }));
  });

  it('a paused campaign cannot be sent', async () => {
    campaignData.value = { ...draft, status: 'paused' };
    expect((await sendPOST(sendReq({ confirmAudience: 5 }), ctx)).status).toBe(409);
  });
});

describe('campaign actions', () => {
  it('the marketing role can pause but cannot schedule, resume or retry failed messages', async () => {
    guardMock.mockResolvedValue(marketer);
    campaignData.value = { ...draft, status: 'sending', counts: { ...draft.counts, targeted: 5 } };
    expect((await PATCH(patchReq({ action: 'pause' }), ctx)).status).toBe(200);
    campaignData.value = { ...draft, status: 'paused', counts: { ...draft.counts, targeted: 5 } };
    expect((await PATCH(patchReq({ action: 'resume' }), ctx)).status).toBe(403);
    expect((await PATCH(patchReq({ action: 'retry_failed' }), ctx)).status).toBe(403);
    campaignData.value = { ...draft };
    expect((await PATCH(patchReq({ action: 'schedule', scheduledAt: '2099-01-01T00:00:00.000Z' }), ctx)).status).toBe(403);
  });

  it('an administrator can resume a paused campaign and retry failed messages', async () => {
    campaignData.value = { ...draft, status: 'paused', counts: { ...draft.counts, targeted: 5 } };
    expect((await PATCH(patchReq({ action: 'resume' }), ctx)).status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'sending' }));
    campaignData.value = { ...draft, status: 'sent' };
    const retried = await PATCH(patchReq({ action: 'retry_failed' }), ctx);
    expect((await retried.json()).requeued).toBe(2);
  });

  it('scheduling needs an approved template', async () => {
    templateProblem.mockResolvedValue('not approved');
    expect((await PATCH(patchReq({ action: 'schedule', scheduledAt: '2099-01-01T00:00:00.000Z' }), ctx)).status).toBe(409);
  });

  it('cancelling stops unsent recipients and a finished campaign cannot be cancelled', async () => {
    campaignData.value = { ...draft, status: 'sending' };
    expect((await PATCH(patchReq({ action: 'cancel' }), ctx)).status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }));
    campaignData.value = { ...draft, status: 'sent' };
    expect((await PATCH(patchReq({ action: 'cancel' }), ctx)).status).toBe(409);
  });
});

describe('campaign report', () => {
  const row = (phone: string, status: string, error?: string) => ({ get: (k: string) => ({ phone, status, error })[k as 'phone'] });
  it('the summary needs only the marketing permission; the CSV export needs whatsapp:export', async () => {
    recipients.docs = [row('+919876543210', 'sent')];
    recipients.size = 1;
    await reportGET(new Request('https://example.com/x'), ctx);
    expect(guardMock).toHaveBeenLastCalledWith(expect.anything(), 'marketing:whatsapp');
    await reportGET(new Request('https://example.com/x?format=csv'), ctx);
    expect(guardMock).toHaveBeenLastCalledWith(expect.anything(), 'whatsapp:export');
    guardMock.mockResolvedValue(denied(403));
    expect((await reportGET(new Request('https://example.com/x?format=csv'), ctx)).status).toBe(403);
  });

  it('the CSV holds hidden numbers, statuses and reasons only, with formulas neutralised', async () => {
    recipients.docs = [row('+919876543210', 'failed', '=cmd|calc'), row('+919811112222', 'sent')];
    recipients.size = 2;
    const res = await reportGET(new Request('https://example.com/x?format=csv'), ctx);
    const text = await res.text();
    expect(text).toContain('••••3210,failed');
    expect(text).not.toMatch(/9876543210|9811112222|Diwali/);
    expect(text).toContain("'=cmd|calc");
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'marketing.campaign_report_exported' }));
  });
});

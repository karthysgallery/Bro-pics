import { describe, it, expect, vi } from 'vitest';
import { becameQueued, dueForDispatch, dispatchToRenderer } from './dispatch';

const now = new Date('2026-10-07T10:00:00Z');
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

describe('becameQueued', () => {
  it('fires for a new job, an admin retry and a re-render, but not for other writes', () => {
    expect(becameQueued(undefined, { status: 'queued' })).toBe(true);
    expect(becameQueued({ status: 'failed_permanent' }, { status: 'queued' })).toBe(true);
    expect(becameQueued({ status: 'done' }, { status: 'queued' })).toBe(true);
    expect(becameQueued({ status: 'queued' }, { status: 'queued' })).toBe(false);
    expect(becameQueued({ status: 'queued' }, { status: 'leased' })).toBe(false);
    expect(becameQueued({ status: 'leased' }, undefined)).toBe(false);
  });
});

describe('dueForDispatch', () => {
  it('retries a failed job only once its backoff has passed', () => {
    expect(dueForDispatch({ status: 'failed', nextAttemptAt: minutesAgo(1), createdAt: minutesAgo(30) }, now)).toBe(true);
    expect(dueForDispatch({ status: 'failed', nextAttemptAt: minutesAgo(-5), createdAt: minutesAgo(30) }, now)).toBe(false);
  });

  it('takes over a lease whose worker died, but not a live one', () => {
    expect(dueForDispatch({ status: 'leased', leaseExpiresAt: minutesAgo(1), createdAt: minutesAgo(30) }, now)).toBe(true);
    expect(dueForDispatch({ status: 'leased', leaseExpiresAt: minutesAgo(-3), createdAt: minutesAgo(30) }, now)).toBe(false);
  });

  it('re-sends a queued job whose first dispatch was lost', () => {
    expect(dueForDispatch({ status: 'queued', updatedAt: minutesAgo(6), createdAt: minutesAgo(6) }, now)).toBe(true);
    expect(dueForDispatch({ status: 'queued', updatedAt: minutesAgo(1), createdAt: minutesAgo(1) }, now)).toBe(false);
  });

  it('never touches finished jobs or jobs from before the rollout cutoff', () => {
    expect(dueForDispatch({ status: 'done', createdAt: minutesAgo(60) }, now)).toBe(false);
    expect(dueForDispatch({ status: 'failed_permanent', createdAt: minutesAgo(60) }, now)).toBe(false);
    expect(dueForDispatch({ status: 'failed', createdAt: minutesAgo(60) }, now, minutesAgo(30))).toBe(false);
    expect(dueForDispatch({ status: 'failed', createdAt: minutesAgo(10) }, now, minutesAgo(30))).toBe(true);
  });
});

describe('dispatchToRenderer', () => {
  const response = (status: number) => ({ ok: status >= 200 && status < 300, status, text: async () => 'x' }) as Response;

  it('calls the private renderer with a signed ID token for its own URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200));
    const idToken = vi.fn().mockResolvedValue('signed-token');
    const result = await dispatchToRenderer('https://print-render-abc.a.run.app/', 'order1_item1', { fetch: fetchMock, idToken });
    expect(result).toBe('rendered');
    expect(idToken).toHaveBeenCalledWith('https://print-render-abc.a.run.app');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://print-render-abc.a.run.app/render/order1_item1',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer signed-token' }) })
    );
  });

  it('treats 409 (already leased or done) as not an error, and anything else as a failure', async () => {
    expect(await dispatchToRenderer('https://r', 'j', { fetch: vi.fn().mockResolvedValue(response(409)), idToken: async () => 't' })).toBe('busy');
    expect(await dispatchToRenderer('https://r', 'j', { fetch: vi.fn().mockResolvedValue(response(500)), idToken: async () => 't' })).toBe('failed');
  });

  it('sends no token on the emulator', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200));
    await dispatchToRenderer('http://localhost:8181', 'j', { fetch: fetchMock, idToken: async () => null });
    expect(fetchMock.mock.calls[0]![1].headers).not.toHaveProperty('Authorization');
  });
});

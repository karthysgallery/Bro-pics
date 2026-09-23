import { describe, it, expect } from 'vitest';
import { findStaleAnonymousDocs, type DocForCleanup } from './stale-anonymous-docs';

const NOW = new Date('2026-09-24T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function doc(overrides: Partial<DocForCleanup> = {}): DocForCleanup {
  return { id: 'doc_1', createdAt: new Date(NOW.getTime() - 40 * DAY_MS), ...overrides };
}

describe('findStaleAnonymousDocs', () => {
  it('flags a session-only doc older than the threshold', () => {
    expect(findStaleAnonymousDocs([doc()], NOW, 30)).toEqual(['doc_1']);
  });

  it('never flags a doc that has a userId, regardless of age', () => {
    const linked = doc({ userId: 'user_1' });
    expect(findStaleAnonymousDocs([linked], NOW, 30)).toEqual([]);
  });

  it('does not flag a session-only doc within the threshold', () => {
    const recent = doc({ createdAt: new Date(NOW.getTime() - 5 * DAY_MS) });
    expect(findStaleAnonymousDocs([recent], NOW, 30)).toEqual([]);
  });

  it('never flags a doc with no createdAt at all — not a cleanup candidate until backfilled', () => {
    const noTimestamp = doc({ createdAt: undefined });
    expect(findStaleAnonymousDocs([noTimestamp], NOW, 30)).toEqual([]);
  });

  it('defaults the threshold to 30 days', () => {
    const stale = doc({ id: 'doc_1', createdAt: new Date(NOW.getTime() - 31 * DAY_MS) });
    const fresh = doc({ id: 'doc_2', createdAt: new Date(NOW.getTime() - 29 * DAY_MS) });
    expect(findStaleAnonymousDocs([stale, fresh], NOW).map((d) => d)).toEqual(['doc_1']);
  });
});

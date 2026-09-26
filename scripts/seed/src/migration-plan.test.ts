import { describe, it, expect } from 'vitest';
import { planFieldMigration } from './migration-plan';

const BUCKET = 'bropics-app.firebasestorage.app';
const LEGACY_URL = `https://storage.googleapis.com/${BUCKET}/uploads/sess_1/up_1/original.jpg?Signature=x`;

describe('planFieldMigration', () => {
  it('plans a convert when the legacy field has a parseable URL and the new field is absent', () => {
    const entry = planFieldMigration('uploads', 'up_1', { originalUrl: LEGACY_URL }, 'originalUrl', 'originalPath', BUCKET);
    expect(entry.action).toBe('convert');
    expect(entry.newValue).toBe('uploads/sess_1/up_1/original.jpg');
    expect(entry.legacyValue).toBe(LEGACY_URL);
  });

  it('is idempotent: already having the new field skips, even if the legacy field is also present', () => {
    const entry = planFieldMigration(
      'uploads',
      'up_1',
      { originalUrl: LEGACY_URL, originalPath: 'uploads/sess_1/up_1/original.jpg' },
      'originalUrl',
      'originalPath',
      BUCKET
    );
    expect(entry.action).toBe('already-migrated');
  });

  it('skips a doc with no legacy value at all (nothing to migrate)', () => {
    const entry = planFieldMigration('uploads', 'up_1', {}, 'originalUrl', 'originalPath', BUCKET);
    expect(entry.action).toBe('no-legacy-value');
  });

  it('skips a doc whose legacy field is an empty string', () => {
    const entry = planFieldMigration('uploads', 'up_1', { originalUrl: '' }, 'originalUrl', 'originalPath', BUCKET);
    expect(entry.action).toBe('no-legacy-value');
  });

  it('flags an exception when the legacy field is not a parseable signed URL, without guessing', () => {
    const entry = planFieldMigration('uploads', 'up_1', { originalUrl: 'not-a-url' }, 'originalUrl', 'originalPath', BUCKET);
    expect(entry.action).toBe('exception-unparseable');
    expect(entry.legacyValue).toBe('not-a-url');
  });

  it('never includes newValue on a no-legacy-value entry', () => {
    const entry = planFieldMigration('uploads', 'up_1', {}, 'originalUrl', 'originalPath', BUCKET);
    expect(entry.newValue).toBeUndefined();
  });
});

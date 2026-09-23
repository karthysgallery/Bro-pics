import { parseStoragePathFromUrl } from './parse-storage-path-from-url';

export type MigrationAction = 'convert' | 'already-migrated' | 'no-legacy-value' | 'exception-unparseable';

export interface MigrationEntry {
  collection: string;
  docId: string;
  legacyField: string;
  newField: string;
  action: MigrationAction;
  legacyValue?: string;
  newValue?: string;
}

/**
 * Pure decision logic for BE-05a's back-fill migration, kept separate from
 * the Firestore I/O so it's unit-testable without an emulator. Never
 * mutates its input, never deletes the legacy field — the caller decides
 * whether/how to write `newValue` for 'convert' entries; 'already-migrated'
 * and 'no-legacy-value' entries are skipped (idempotent re-runs are safe);
 * 'exception-unparseable' entries go into the dry-run report for a human
 * to look at, never silently dropped or guessed at.
 */
export function planFieldMigration(
  collection: string,
  docId: string,
  data: Record<string, unknown>,
  legacyField: string,
  newField: string,
  bucket: string
): MigrationEntry {
  const base = { collection, docId, legacyField, newField };

  if (typeof data[newField] === 'string' && data[newField].length > 0) {
    return { ...base, action: 'already-migrated', newValue: data[newField] as string };
  }

  const legacyValue = data[legacyField];
  if (typeof legacyValue !== 'string' || legacyValue.length === 0) {
    return { ...base, action: 'no-legacy-value' };
  }

  const path = parseStoragePathFromUrl(legacyValue, bucket);
  if (!path) {
    return { ...base, action: 'exception-unparseable', legacyValue };
  }

  return { ...base, action: 'convert', legacyValue, newValue: path };
}

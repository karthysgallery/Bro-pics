import { deserializeState, type PersonalizationState } from '@bro-pics/shared';

/**
 * Unfinished designs, kept in this browser only. A draft holds the same
 * personalization state a cart line does — upload ids and numbers, never
 * pixels — so it stays tiny. Photos that are still uploading (temporary
 * `local:` ids) are left out: they cannot be fetched again after a reload.
 */
const PREFIX = 'kg:template-draft:v1:';
export const DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

interface StoredDraft {
  savedAt: number;
  state: unknown;
}

function key(productId: string, templateId: string): string {
  return `${PREFIX}${productId}:${templateId}`;
}

/** The state without photos that only exist in this tab (still uploading). */
export function persistableState(state: PersonalizationState): PersonalizationState {
  const slots = Object.fromEntries(Object.entries(state.slots).filter(([, photo]) => !photo.assetId.startsWith('local:')));
  return { ...state, slots };
}

export function hasContent(state: PersonalizationState): boolean {
  return Object.keys(state.slots).length > 0 || Object.values(state.texts).some((t) => t.value.trim().length > 0) || Object.keys(state.dates ?? {}).length > 0;
}

export function saveTemplateDraft(productId: string, state: PersonalizationState, now = Date.now()): void {
  try {
    const persistable = persistableState(state);
    if (!hasContent(persistable)) {
      window.localStorage.removeItem(key(productId, state.templateId));
      return;
    }
    const draft: StoredDraft = { savedAt: now, state: persistable };
    window.localStorage.setItem(key(productId, state.templateId), JSON.stringify(draft));
  } catch {
    // Private browsing or a full quota: drafts are a convenience.
  }
}

export function loadTemplateDraft(productId: string, templateId: string, now = Date.now()): PersonalizationState | null {
  try {
    const raw = window.localStorage.getItem(key(productId, templateId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as StoredDraft;
    if (typeof draft.savedAt !== 'number' || now - draft.savedAt > DRAFT_MAX_AGE_MS) {
      window.localStorage.removeItem(key(productId, templateId));
      return null;
    }
    const parsed = deserializeState(draft.state);
    if (!parsed.ok || parsed.state.templateId !== templateId || !hasContent(parsed.state)) return null;
    return parsed.state;
  } catch {
    return null;
  }
}

export function clearTemplateDraft(productId: string, templateId: string): void {
  try {
    window.localStorage.removeItem(key(productId, templateId));
  } catch {
    // ignore
  }
}

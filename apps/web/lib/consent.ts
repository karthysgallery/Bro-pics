export type ConsentStatus = 'accepted' | 'declined';

const STORAGE_KEY = 'bropics_analytics_consent';

/**
 * [FE-40] The event-taxonomy instrumentation itself (page_view,
 * personalization_started/completed/abandoned, add_to_cart, etc.) is
 * blocked on BE-31 — no analytics stack has been chosen, and no real
 * GA4/BigQuery account exists to send events to (see BE-31's own
 * "external-account-blocked" entry). The consent banner doesn't depend on
 * that decision at all, so it's built now: `hasAnalyticsConsent()` is the
 * real gate whatever tracking code BE-31 eventually adds should check
 * before firing anything non-essential, so consent is correct from day
 * one rather than retrofitted after the fact.
 */
export function getConsentStatus(): ConsentStatus | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === 'accepted' || raw === 'declined' ? raw : null;
  } catch {
    return null;
  }
}

export function setConsentStatus(status: ConsentStatus): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, status);
  } catch {
    // localStorage can throw in private-browsing/blocked-storage contexts.
  }
}

export function hasAnalyticsConsent(): boolean {
  return getConsentStatus() === 'accepted';
}

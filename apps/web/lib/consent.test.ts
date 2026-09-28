import { describe, it, expect, beforeEach } from 'vitest';
import { getConsentStatus, setConsentStatus, hasAnalyticsConsent } from './consent';

describe('consent', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when no choice has been recorded', () => {
    expect(getConsentStatus()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it('records and reads back an accepted choice', () => {
    setConsentStatus('accepted');
    expect(getConsentStatus()).toBe('accepted');
    expect(hasAnalyticsConsent()).toBe(true);
  });

  it('records and reads back a declined choice', () => {
    setConsentStatus('declined');
    expect(getConsentStatus()).toBe('declined');
    expect(hasAnalyticsConsent()).toBe(false);
  });
});

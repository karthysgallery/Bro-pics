import 'server-only';
import { getFirestore } from 'firebase-admin/firestore';
import {
  legalValuesFrom,
  parseBusinessProfile,
  parsePolicyFacts,
  parseReturnsSettings,
  parseStateShipping,
  unconfiguredStates,
  type LegalValues,
  type StateShippingSettings,
} from '@bro-pics/shared';
import { getAdminApp } from './firebase-admin';

/**
 * A sentence about shipping built from the REAL shipping settings. It is only produced once every state outside
 * the home state has a charge (or a fallback exists): until then the sentence would not be true, so the token
 * stays empty and any policy that uses it cannot be published.
 */
export function shippingSummaryFrom(settings: StateShippingSettings): string | undefined {
  if (unconfiguredStates(settings).length > 0) return undefined;
  const express = settings.expressEnabled ? ' Express delivery is available for an extra charge shown at checkout.' : '';
  return `Shipping is free across ${settings.homeState}. For every other state or union territory the shipping charge is shown at checkout before you pay.${express}`;
}

/** Everything a legal page can fill in, read fresh from the saved settings. Missing facts are simply absent. */
export async function loadLegalValues(): Promise<LegalValues> {
  const db = getFirestore(getAdminApp());
  const [store, returns, facts, shipping] = await Promise.all(
    ['store', 'returns', 'policyFacts', 'shipping'].map((key) => db.collection('settings').doc(key).get())
  );
  const shippingSettings = parseStateShipping(shipping.exists ? shipping.data() : null);
  return legalValuesFrom(store.exists ? parseBusinessProfile(store.data()) : null, {
    returns: parseReturnsSettings(returns.exists ? returns.data() : null),
    facts: parsePolicyFacts(facts.exists ? facts.data() : null),
    homeState: shippingSettings.homeState,
    shippingSummary: shippingSummaryFrom(shippingSettings),
  });
}

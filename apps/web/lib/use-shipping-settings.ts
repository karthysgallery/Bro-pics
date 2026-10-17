'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_STATE_SHIPPING, type StateShippingSettings } from '@bro-pics/shared';
import { getShippingSettingsClient } from './shipping-settings-client';

/**
 * The configured shipping settings (settings/shipping). Every piece of storefront copy that mentions
 * shipping reads it from here, so a promise on the page can't drift from what checkout charges.
 */
export function useShippingSettings(): StateShippingSettings {
  const [settings, setSettings] = useState<StateShippingSettings>(DEFAULT_STATE_SHIPPING);
  useEffect(() => {
    let cancelled = false;
    getShippingSettingsClient().then((loaded) => {
      if (!cancelled) setSettings(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return settings;
}

/** "Free shipping across Tamil Nadu": the one promise the shop makes everywhere, from the real setting. */
export function freeShippingPromise(settings: StateShippingSettings): string | null {
  return `Free shipping across ${settings.homeState}`;
}

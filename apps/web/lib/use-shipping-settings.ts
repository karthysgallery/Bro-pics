'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_SHIPPING_SETTINGS, type ShippingSettings } from './checkout-calc';
import { getShippingSettingsClient } from './shipping-settings-client';
import { formatPaise } from './format-price';

/**
 * The configured shipping rates (settings/shipping), starting from the same
 * defaults the server falls back to. Every piece of storefront copy that
 * mentions a shipping threshold or charge reads it from here, so a promise
 * on the page can't drift from what checkout actually charges.
 */
export function useShippingSettings(): Required<ShippingSettings> {
  const [settings, setSettings] = useState<Required<ShippingSettings>>(DEFAULT_SHIPPING_SETTINGS);
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

/** "Free shipping on orders above ₹1,500" — or null when shipping is always free / never free. */
export function freeShippingPromise(settings: Required<ShippingSettings>): string | null {
  if (settings.flatShippingCharge <= 0) return 'Free shipping on every order';
  if (settings.freeShippingThreshold <= 0) return null;
  return `Free shipping on orders above ${formatPaise(settings.freeShippingThreshold)}`;
}

'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { CONSENT_EVENT } from '../../lib/consent';
import { initMetaPixel, trackMeta } from '../../lib/meta-pixel';
import { captureAttribution } from '../../lib/attribution';

/**
 * Mounted once in the shop layout. Keeps the ad-link campaign (utm_*) for the order, and — when the owner switched
 * Meta tracking on and the visitor accepted cookies — runs the Pixel and sends a PageView on every page change.
 */
export function MetaPixel({ pixelId }: { pixelId: string | null }) {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  // Staff pages are never tracked.
  const staff = pathname?.startsWith('/admin') ?? false;

  useEffect(() => {
    if (staff) return;
    captureAttribution();
    if (!pixelId) return;
    if (initMetaPixel(pixelId) && lastPath.current !== pathname) {
      lastPath.current = pathname;
      trackMeta('PageView');
    }
  }, [pixelId, pathname, staff]);

  // Accepting cookies on this page starts the Pixel straight away.
  useEffect(() => {
    if (!pixelId || staff) return;
    const onConsent = () => {
      captureAttribution();
      if (initMetaPixel(pixelId) && lastPath.current !== location.pathname) {
        lastPath.current = location.pathname;
        trackMeta('PageView');
      }
    };
    window.addEventListener(CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(CONSENT_EVENT, onConsent);
  }, [pixelId, staff]);

  return null;
}

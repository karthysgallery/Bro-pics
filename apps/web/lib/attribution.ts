'use client';

import { hasAnalyticsConsent } from './consent';

/**
 * Where a visitor came from: the ad link's utm_* parameters (and the page they landed on), kept for 30 days in
 * this browser so it survives moving between pages, the cart and checkout, and is saved on the order. The Meta
 * click id (fbclid → the `_fbc` cookie) and browser id (`_fbp`) are only read or written with cookie consent.
 * Nothing personal is stored.
 */

const KEY = 'kg_attribution';
const TTL_MS = 30 * 24 * 3600_000;
const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

export interface StoredAttribution {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  landingPath?: string;
  at: number;
}

const clip = (v: string | null, n: number) => (v ? v.slice(0, n) : undefined);

function readCookie(name: string): string | undefined {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : undefined;
}

function writeCookie(name: string, value: string, days: number) {
  const host = location.hostname;
  // Same cookie for www and the bare domain.
  const domain = host.endsWith('karthysgallery.in') ? '; domain=.karthysgallery.in' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${days * 86400}; path=/; SameSite=Lax${domain}${location.protocol === 'https:' ? '; Secure' : ''}`;
}

/** Called on every page view: a link carrying utm_* replaces the stored campaign (last ad click wins). */
export function captureAttribution(): void {
  if (typeof window === 'undefined') return;
  try {
    const q = new URLSearchParams(location.search);
    if (UTM.some((k) => q.get(k))) {
      const a: StoredAttribution = {
        utmSource: clip(q.get('utm_source'), 100),
        utmMedium: clip(q.get('utm_medium'), 100),
        utmCampaign: clip(q.get('utm_campaign'), 150),
        utmContent: clip(q.get('utm_content'), 150),
        utmTerm: clip(q.get('utm_term'), 150),
        landingPath: location.pathname.slice(0, 300),
        at: Date.now(),
      };
      localStorage.setItem(KEY, JSON.stringify(a));
    }
    const fbclid = q.get('fbclid');
    if (fbclid && hasAnalyticsConsent()) writeCookie('_fbc', `fb.1.${Date.now()}.${fbclid.slice(0, 200)}`, 90);
  } catch {
    // Storage blocked (private mode): attribution is simply not kept.
  }
}

/** What create-order saves on the order: the campaign (if any, and not older than 30 days) plus Meta ids with consent. */
export function attributionForOrder(): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  try {
    const raw = localStorage.getItem(KEY);
    const a = raw ? (JSON.parse(raw) as StoredAttribution) : null;
    if (a && Date.now() - a.at < TTL_MS) {
      for (const k of ['utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'utmTerm', 'landingPath'] as const) if (a[k]) out[k] = String(a[k]);
    }
  } catch {
    // ignore
  }
  const consent = hasAnalyticsConsent();
  out.adConsent = consent;
  if (consent) {
    const fbc = readCookie('_fbc');
    const fbp = readCookie('_fbp');
    if (fbc) out.fbc = fbc.slice(0, 300);
    if (fbp) out.fbp = fbp.slice(0, 100);
    out.userAgent = navigator.userAgent.slice(0, 400);
  }
  return out;
}

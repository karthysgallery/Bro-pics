'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { DEFAULT_SITE_TEXT, type SiteText } from '@bro-pics/shared';

const SiteTextContext = createContext<SiteText>(DEFAULT_SITE_TEXT);

/** The admin-edited shop wording (Admin > Website > Site text), loaded once in the root layout. */
export function SiteTextProvider({ value, children }: { value: SiteText; children: ReactNode }) {
  return <SiteTextContext.Provider value={value}>{children}</SiteTextContext.Provider>;
}

export function useSiteText(): SiteText {
  return useContext(SiteTextContext);
}

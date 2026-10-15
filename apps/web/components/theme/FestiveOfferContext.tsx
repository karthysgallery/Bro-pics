'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { ThemeOffer } from '@bro-pics/shared';

const FestiveOfferContext = createContext<ThemeOffer | null>(null);

/** The running festival offer (if any), for product prices and checkout. */
export function FestiveOfferProvider({ offer, children }: { offer: ThemeOffer | null; children: ReactNode }) {
  return <FestiveOfferContext.Provider value={offer}>{children}</FestiveOfferContext.Provider>;
}

export function useFestiveOffer(): ThemeOffer | null {
  return useContext(FestiveOfferContext);
}

/** The price after the offer, rounded the way the checkout rounds a percent coupon. */
export function priceWithOffer(pricePaise: number, offer: ThemeOffer): number {
  return pricePaise - Math.round((pricePaise * offer.percentOff) / 100);
}

'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * The shop's public contact details, supplied once by the root layout from the saved business profile
 * (Admin > Store Settings). Components read them here instead of repeating a number or address in code.
 * A detail the owner has not saved is simply absent: nothing is invented and no placeholder is shown.
 */
export interface BusinessContact {
  name: string;
  supportEmail?: string;
  /** Digits only with the country code (what wa.me expects), or undefined when no WhatsApp number is saved. */
  whatsappDigits?: string;
  supportPhone?: string;
}

const EMPTY: BusinessContact = { name: 'KarthysGallery' };
const Ctx = createContext<BusinessContact>(EMPTY);

export function BusinessContactProvider({ value, children }: { value: BusinessContact | null; children: ReactNode }) {
  return <Ctx.Provider value={value ?? EMPTY}>{children}</Ctx.Provider>;
}

export const useBusinessContact = (): BusinessContact => useContext(Ctx);

/** A wa.me link with a prefilled message, or null when the shop has no WhatsApp number saved. */
export function whatsappLink(contact: BusinessContact, message: string): string | null {
  return contact.whatsappDigits ? `https://wa.me/${contact.whatsappDigits}?text=${encodeURIComponent(message)}` : null;
}

import { z } from 'zod';
import { INDIAN_STATES_AND_UTS, normalizeStateName } from '../shipping/state-shipping';

/**
 * The shop's business details, stored in `settings/store` and edited by an authorised admin.
 * Nothing here is ever invented: every field the owner has not entered is simply absent, and every
 * public page, invoice and message that needs one falls back to a neutral wording or hides the line.
 */

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).optional().transform((v) => (v ? v : undefined));

/** Indian PIN code: six digits, first digit 1-8 (9 is the army postal service). */
const PIN = /^[1-8][0-9]{5}$/;
/** Loose email shape; the point is to catch typos, not to validate deliverability. */
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;
/** International phone/WhatsApp number: digits with an optional leading +, 10-15 digits. */
const PHONE = /^\+?[0-9][0-9 \-]{8,18}[0-9]$/;

export const GST_REGISTRATION = ['not_registered', 'registered', 'unconfirmed'] as const;
export type GstRegistration = (typeof GST_REGISTRATION)[number];

export const BusinessProfileSchema = z
  .object({
    // Existing fields (kept so older saved documents stay valid)
    name: text(80).min(1),
    supportPhone: text(30).default(''),
    processingDays: z.number().int().nonnegative().max(60),
    description: optionalText(500),
    legalName: optionalText(120),
    /** Older free-text address. Still read, but the structured fields below win. */
    address: optionalText(400),
    // Structured address (the owner fills these in; no defaults)
    addressLine1: optionalText(120),
    addressLine2: optionalText(120),
    city: optionalText(80),
    district: optionalText(80),
    state: z.string().trim().optional().transform((v) => (v ? v : undefined)).refine((v) => v === undefined || normalizeStateName(v) !== null, 'Choose a state or union territory'),
    pincode: z.string().trim().optional().transform((v) => (v ? v : undefined)).refine((v) => v === undefined || PIN.test(v), 'Enter a valid 6-digit PIN code'),
    country: optionalText(60),
    // Contact
    supportEmail: z.string().trim().optional().transform((v) => (v ? v : undefined)).refine((v) => v === undefined || EMAIL.test(v), 'Enter a valid email address'),
    supportWhatsapp: z.string().trim().optional().transform((v) => (v ? v : undefined)).refine((v) => v === undefined || PHONE.test(v), 'Enter a valid WhatsApp number with country code'),
    // People
    ownerName: optionalText(80),
    grievanceName: optionalText(80),
    grievanceDesignation: optionalText(80),
    grievanceEmail: z.string().trim().optional().transform((v) => (v ? v : undefined)).refine((v) => v === undefined || EMAIL.test(v), 'Enter a valid email address'),
    grievancePhone: z.string().trim().optional().transform((v) => (v ? v : undefined)).refine((v) => v === undefined || PHONE.test(v), 'Enter a valid phone number'),
    // Tax. The owner states it is NOT GST-registered; that is recorded, never assumed or hidden.
    gstRegistration: z.enum(GST_REGISTRATION).default('unconfirmed'),
    /** Free text printed on invoices (for example, the tax status wording the owner's accountant confirms). */
    invoiceNote: optionalText(400),
  })
  .strict();

export type BusinessProfile = z.infer<typeof BusinessProfileSchema>;

/** The fields a customer-facing page may use, in one resolved object. Missing = undefined. */
export interface PublicBusinessDetails {
  name: string;
  legalName?: string;
  addressOneLine?: string;
  supportEmail?: string;
  supportWhatsapp?: string;
  supportPhone?: string;
  ownerName?: string;
  grievanceName?: string;
  grievanceDesignation?: string;
  grievanceEmail?: string;
  grievancePhone?: string;
  gstRegistration: GstRegistration;
}

/** "Street, City, District, State PIN, India", skipping anything not entered. Null when no address exists at all. */
export function formatAddress(p: Partial<BusinessProfile>): string | null {
  const structured = [p.addressLine1, p.addressLine2, p.city, p.district, [p.state, p.pincode].filter(Boolean).join(' ') || undefined, p.country]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean);
  if (structured.length > 0) return structured.join(', ');
  return p.address?.trim() || null;
}

/** A WhatsApp number as wa.me expects it: digits only, country code first. Null if not a plausible number. */
export function whatsappDigits(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

/** Defensive read of a stored document: invalid pieces are dropped rather than shown. */
export function parseBusinessProfile(raw: unknown): PublicBusinessDetails | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  // Validate field by field so one malformed value never hides the rest.
  const pick = <T,>(schema: z.ZodType<T>, value: unknown): T | undefined => {
    const r = schema.safeParse(value);
    return r.success ? r.data : undefined;
  };
  const name = pick(z.string().trim().min(1).max(80), data.name);
  if (!name) return null;
  const partial: Partial<BusinessProfile> = {
    address: pick(z.string().trim().max(400), data.address) || undefined,
    addressLine1: pick(z.string().trim().max(120), data.addressLine1) || undefined,
    addressLine2: pick(z.string().trim().max(120), data.addressLine2) || undefined,
    city: pick(z.string().trim().max(80), data.city) || undefined,
    district: pick(z.string().trim().max(80), data.district) || undefined,
    state: pick(z.string().trim(), data.state) || undefined,
    pincode: pick(z.string().trim().regex(PIN), data.pincode),
    country: pick(z.string().trim().max(60), data.country) || undefined,
  };
  const email = (v: unknown) => pick(z.string().trim().regex(EMAIL), v);
  const phone = (v: unknown) => pick(z.string().trim().regex(PHONE), v);
  const str = (v: unknown, max: number) => pick(z.string().trim().max(max), v) || undefined;
  const gst = pick(z.enum(GST_REGISTRATION), data.gstRegistration) ?? 'unconfirmed';
  const addressOneLine = formatAddress(partial) ?? undefined;
  return {
    name,
    ...(str(data.legalName, 120) && { legalName: str(data.legalName, 120) }),
    ...(addressOneLine && { addressOneLine }),
    ...(email(data.supportEmail) && { supportEmail: email(data.supportEmail) }),
    ...(phone(data.supportWhatsapp) && { supportWhatsapp: phone(data.supportWhatsapp) }),
    ...(phone(data.supportPhone) && { supportPhone: phone(data.supportPhone) }),
    ...(str(data.ownerName, 80) && { ownerName: str(data.ownerName, 80) }),
    ...(str(data.grievanceName, 80) && { grievanceName: str(data.grievanceName, 80) }),
    ...(str(data.grievanceDesignation, 80) && { grievanceDesignation: str(data.grievanceDesignation, 80) }),
    ...(email(data.grievanceEmail) && { grievanceEmail: email(data.grievanceEmail) }),
    ...(phone(data.grievancePhone) && { grievancePhone: phone(data.grievancePhone) }),
    gstRegistration: gst,
  };
}

/** Details the shop cannot open without: what the admin must still fill in. Plain-language labels. */
export function missingBusinessDetails(profile: PublicBusinessDetails | null): string[] {
  const missing: string[] = [];
  if (!profile) return ['Business profile (nothing is saved yet)'];
  if (!profile.legalName) missing.push('Legal business name');
  if (!profile.addressOneLine) missing.push('Complete business address');
  if (!profile.supportEmail) missing.push('Support email');
  if (!profile.supportWhatsapp && !profile.supportPhone) missing.push('Support WhatsApp number or phone');
  if (!profile.grievanceName) missing.push('Grievance contact name');
  if (!profile.grievanceDesignation) missing.push('Grievance contact designation');
  if (!profile.grievanceEmail && !profile.grievancePhone) missing.push('Grievance contact email or phone');
  if (profile.gstRegistration === 'unconfirmed') missing.push('GST registration status (confirm with your tax professional)');
  return missing;
}

export { INDIAN_STATES_AND_UTS };

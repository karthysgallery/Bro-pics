import { z } from 'zod';
import type { PublicBusinessDetails } from './business-profile';
import type { ReturnsSettings } from '../returns/eligibility';

/**
 * Wording the owner decides for the policies (not facts the code can know). Every field is optional and
 * empty by default; a policy that needs one cannot be published until it is written. settings/policyFacts.
 */
export const PolicyFactsSchema = z
  .object({
    dispatchTime: z.string().trim().max(300).optional().transform((v) => (v ? v : undefined)),
    deliveryEstimate: z.string().trim().max(400).optional().transform((v) => (v ? v : undefined)),
    cancellationRule: z.string().trim().max(500).optional().transform((v) => (v ? v : undefined)),
    refundTiming: z.string().trim().max(400).optional().transform((v) => (v ? v : undefined)),
    photoRetention: z.string().trim().max(400).optional().transform((v) => (v ? v : undefined)),
    responseTime: z.string().trim().max(200).optional().transform((v) => (v ? v : undefined)),
    supportHours: z.string().trim().max(200).optional().transform((v) => (v ? v : undefined)),
    jurisdiction: z.string().trim().max(200).optional().transform((v) => (v ? v : undefined)),
  })
  .strict();
export type PolicyFacts = z.infer<typeof PolicyFactsSchema>;
export const parsePolicyFacts = (raw: unknown): PolicyFacts => {
  const r = PolicyFactsSchema.safeParse(raw ?? {});
  return r.success ? r.data : {};
};

/**
 * Legal and policy pages are written with {{tokens}} for business facts. At render time each token is
 * replaced from the saved business profile. A token with no value is NEVER shown: the page then counts
 * as incomplete and cannot be published. Internal workflow notes can never reach a customer either.
 */

export const LEGAL_TOKENS = [
  'businessName',
  'legalName',
  'address',
  'supportEmail',
  'supportWhatsapp',
  'supportPhone',
  'ownerName',
  'grievanceName',
  'grievanceDesignation',
  'grievanceEmail',
  'grievancePhone',
  'claimWindowDays',
  'readyMadeReturnDays',
  'homeState',
  'shippingSummary',
  'claimInstructions',
  'dispatchTime',
  'deliveryEstimate',
  'cancellationRule',
  'refundTiming',
  'photoRetention',
  'responseTime',
  'supportHours',
  'jurisdiction',
] as const;
export type LegalToken = (typeof LEGAL_TOKENS)[number];

const TOKEN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** Internal workflow labels that must never appear on a public page. */
const WORKFLOW_MARKERS = /NEEDS\s+(OWNER|LEGAL|TAX|PROFESSIONAL)[^<\n]*|\[\s*NEEDS[^\]]*\]|OWNER\s+CONFIRMATION|LEGAL\s+REVIEW|\bTODO\b|\bFIXME\b|lorem ipsum/i;

export interface LegalValues extends Partial<Record<LegalToken, string>> {}

export interface LegalExtras {
  /** Only values the owner marked Approved are passed in; anything else must be left out so its token stays unresolved. */
  returns?: ReturnsSettings;
  facts?: PolicyFacts;
  homeState?: string;
  /** A sentence derived from the real shipping settings (never typed by hand). */
  shippingSummary?: string;
}

export function legalValuesFrom(profile: PublicBusinessDetails | null, extra: LegalExtras = {}): LegalValues {
  const v: LegalValues = {};
  if (profile) {
    v.businessName = profile.name;
    if (profile.legalName) v.legalName = profile.legalName;
    if (profile.addressOneLine) v.address = profile.addressOneLine;
    if (profile.supportEmail) v.supportEmail = profile.supportEmail;
    if (profile.supportWhatsapp) v.supportWhatsapp = profile.supportWhatsapp;
    if (profile.supportPhone) v.supportPhone = profile.supportPhone;
    if (profile.ownerName) v.ownerName = profile.ownerName;
    if (profile.grievanceName) v.grievanceName = profile.grievanceName;
    if (profile.grievanceDesignation) v.grievanceDesignation = profile.grievanceDesignation;
    if (profile.grievanceEmail) v.grievanceEmail = profile.grievanceEmail;
    if (profile.grievancePhone) v.grievancePhone = profile.grievancePhone;
  }
  const r = extra.returns;
  if (r?.claimWindowApproved && r.claimWindowDays !== null) v.claimWindowDays = String(r.claimWindowDays);
  if (r?.readyMadeChangeOfMindApproved && r.readyMadeChangeOfMindDays !== null && r.readyMadeChangeOfMindDays > 0) v.readyMadeReturnDays = String(r.readyMadeChangeOfMindDays);
  if (r?.claimInstructions) v.claimInstructions = r.claimInstructions;
  if (extra.homeState) v.homeState = extra.homeState;
  if (extra.shippingSummary) v.shippingSummary = extra.shippingSummary;
  if (extra.facts?.dispatchTime) v.dispatchTime = extra.facts.dispatchTime;
  if (extra.facts?.deliveryEstimate) v.deliveryEstimate = extra.facts.deliveryEstimate;
  if (extra.facts?.cancellationRule) v.cancellationRule = extra.facts.cancellationRule;
  if (extra.facts?.refundTiming) v.refundTiming = extra.facts.refundTiming;
  if (extra.facts?.photoRetention) v.photoRetention = extra.facts.photoRetention;
  if (extra.facts?.responseTime) v.responseTime = extra.facts.responseTime;
  if (extra.facts?.supportHours) v.supportHours = extra.facts.supportHours;
  if (extra.facts?.jurisdiction) v.jurisdiction = extra.facts.jurisdiction;
  return v;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Replaces each known token that has a value; unknown or valueless tokens are left in place so the caller can detect them. */
export function fillLegalTokens(html: string, values: LegalValues): string {
  return html.replace(TOKEN, (whole, name: string) => {
    const value = (values as Record<string, string | undefined>)[name];
    return typeof value === 'string' && value.length > 0 ? escapeHtml(value) : whole;
  });
}

/** Tokens still unresolved after filling (for admin warnings). */
export function unresolvedTokens(html: string): string[] {
  return [...new Set([...html.matchAll(TOKEN)].map((m) => m[1]))];
}

/** Why this text must not be shown to customers yet. Empty array = nothing blocks it. */
export function publicationBlockers(html: string): string[] {
  const blockers: string[] = [];
  const open = unresolvedTokens(html);
  if (open.length > 0) blockers.push(`Missing business details: ${open.join(', ')}`);
  const marker = WORKFLOW_MARKERS.exec(html);
  if (marker) blockers.push(`Contains an internal note: "${marker[0].slice(0, 60)}"`);
  if (html.replace(/<[^>]*>/g, '').trim().length < 40) blockers.push('The page has almost no text');
  return blockers;
}

/** The text to show a visitor, or null when it is not safe to show (incomplete, placeholders left, notes left). */
export function renderLegalHtml(html: string, values: LegalValues): string | null {
  const filled = fillLegalTokens(html, values);
  return publicationBlockers(filled).length === 0 ? filled : null;
}

/** Pages whose public text must be explicitly approved by an authorised admin before it can show. */
// `about` is included because its older built-in text made marketing claims nobody had verified.
export const LEGAL_PAGE_SLUGS = ['privacy', 'terms', 'shipping-policy', 'return-refund-policy', 'cancellation-policy', 'contact', 'grievance', 'about'] as const;
export const isLegalSlug = (slug: string): boolean => (LEGAL_PAGE_SLUGS as readonly string[]).includes(slug);

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function utf8Bytes(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

/**
 * SHA-256 of the page text (hex). Synchronous and dependency-free so the same code runs in the browser and on the
 * server. An approval is bound to this digest, so it stops counting the moment the text changes by even one character.
 */
export function textFingerprint(text: string): string {
  const bytes = utf8Bytes(text);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  for (const w of [hi, lo]) bytes.push((w >>> 24) & 255, (w >>> 16) & 255, (w >>> 8) & 255, w & 255);

  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Array<number>(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = ((bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) | (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3]) | 0;
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + SHA256_K[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }
  return h.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

export type PageStatus = 'draft' | 'approved' | 'published';

export interface PageApprovalFacts {
  slug: string;
  bodyHtml: string;
  isPublished: boolean;
  approvedHash?: string | null;
}

/** An approval is valid only for the exact text that was approved. */
export const isApproved = (p: Pick<PageApprovalFacts, 'bodyHtml' | 'approvedHash'>): boolean => !!p.approvedHash && p.approvedHash === textFingerprint(p.bodyHtml);

/** draft = being written; approved = the owner signed this exact text off; published = customers can see it. */
export function pageStatus(p: PageApprovalFacts): PageStatus {
  if (p.isPublished && (!isLegalSlug(p.slug) || isApproved(p))) return 'published';
  return isLegalSlug(p.slug) && isApproved(p) ? 'approved' : 'draft';
}

/** Whether a visitor may see this page at all. Legal pages need a valid approval; other pages only need to be published. */
export const isVisibleToPublic = (p: PageApprovalFacts): boolean => p.isPublished && (!isLegalSlug(p.slug) || isApproved(p));

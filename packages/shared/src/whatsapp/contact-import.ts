import { customerIdForPhone } from '../billing/invoice-engine';
import type { Consent, Customer } from '../schemas/billing';

/**
 * Importing a customer list (a CSV exported from Excel). Pure functions: no database, no network, so the same plan
 * can be shown as a dry-run preview and then recomputed on the server at the moment of the real import.
 *
 * The rule that matters most: a phone number is NOT marketing consent. A row only becomes "opted in" when it carries
 * a consent source, a real past timestamp and some evidence/reference; otherwise it is stored as consent UNKNOWN and
 * is never picked for a marketing campaign. An opt-out already on record (or on the suppression list) is never undone
 * by an import.
 */

export const IMPORT_LIMITS = { maxBytes: 1_000_000, maxRows: 2000, maxCell: 300 } as const;

export const TEMPLATE_COLUMNS = [
  'name',
  'phone',
  'email',
  'city',
  'state',
  'origin',
  'tags',
  'marketing_consent',
  'consent_source',
  'consent_at',
  'consent_evidence',
  'policy_version',
] as const;
export type TemplateColumn = (typeof TEMPLATE_COLUMNS)[number];

export class ImportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportFileError';
  }
}

/** A downloadable template: header plus two clearly fake example rows. */
export function templateCsv(): string {
  return [
    TEMPLATE_COLUMNS.join(','),
    'Example Customer,9876543210,example@example.com,Srivilliputhur,Tamil Nadu,offline,diwali-2025;frames,unknown,,,,',
    'Another Example,+919812345678,,Madurai,Tamil Nadu,online,,opted_in,signup form,2026-01-15,Form #123 signed on 2026-01-15,v1',
  ].join('\r\n') + '\r\n';
}

/** Minimal RFC-4180 parser (quotes, doubled quotes, CRLF/LF, BOM). Bounded by IMPORT_LIMITS. */
export function parseCsv(text: string): string[][] {
  if (typeof text !== 'string') throw new ImportFileError('The file could not be read as text.');
  if (text.length > IMPORT_LIMITS.maxBytes) throw new ImportFileError(`The file is larger than ${IMPORT_LIMITS.maxBytes / 1000} KB. Split it into smaller files.`);
  if (text.includes('\u0000')) throw new ImportFileError('This does not look like a CSV text file (it contains binary data). Save it as CSV from Excel and try again.');
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '') inQuotes = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      if (rows.length > IMPORT_LIMITS.maxRows + 1) throw new ImportFileError(`More than ${IMPORT_LIMITS.maxRows} rows. Split the file.`);
    } else cell += ch;
  }
  if (inQuotes) throw new ImportFileError('The file has an unclosed quotation mark.');
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  if (rows.length > IMPORT_LIMITS.maxRows + 1) throw new ImportFileError(`More than ${IMPORT_LIMITS.maxRows} rows. Split the file.`);
  return rows;
}

/** E.164 for an Indian mobile (as typed in India) or any international number written with a leading + or 00. */
export function normalizePhoneE164(input: string): string {
  const raw = String(input ?? '').trim();
  let cleaned = raw.replace(/[\s\-().]/g, '');
  if (/^00\d/.test(cleaned)) cleaned = `+${cleaned.slice(2)}`;
  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1);
    if (!/^\d{8,15}$/.test(digits) || digits.startsWith('0')) throw new Error('Not a valid international number.');
    if (digits.startsWith('91')) {
      if (!/^91[6-9]\d{9}$/.test(digits)) throw new Error('Not a valid Indian mobile number.');
    }
    return `+${digits}`;
  }
  if (cleaned.startsWith('91') && cleaned.length === 12) cleaned = cleaned.slice(2);
  else if (cleaned.startsWith('0') && cleaned.length === 11) cleaned = cleaned.slice(1);
  if (!/^[6-9]\d{9}$/.test(cleaned)) throw new Error('Not a valid 10-digit Indian mobile number.');
  return `+91${cleaned}`;
}

/** Last four digits only, for any message or report that must refer to a number. */
export const maskPhone = (e164: string): string => `••••${e164.replace(/\D/g, '').slice(-4)}`;

const FORMULA_START = /^[=+\-@\t\r]/;

/** Makes a value safe to write into a CSV that will be opened in Excel (formula injection). */
export function csvSafe(value: string): string {
  const v = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export type ConflictStrategy = 'skip_existing' | 'fill_empty' | 'update_details';
export const CONFLICT_STRATEGIES: ConflictStrategy[] = ['skip_existing', 'fill_empty', 'update_details'];

export interface ParsedRow {
  line: number;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  state: string | null;
  origin: 'offline' | 'online' | 'other';
  tags: string[];
  /** What the file CLAIMS. The consent actually applied is decided in `resolveConsent`. */
  claimedConsent: 'opted_in' | 'opted_out' | 'unknown';
  consentSource: string | null;
  consentAt: string | null;
  consentEvidence: string | null;
  policyVersion: string | null;
}

export interface RowIssue {
  line: number;
  field: string;
  message: string;
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const ORIGINS = ['offline', 'online', 'other'] as const;

function cleanCell(value: string | undefined): string {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, IMPORT_LIMITS.maxCell);
}

/** Reads the header row (any order, case-insensitive, unknown columns ignored) and validates each data row. */
export function parseContactRows(grid: string[][], now: Date = new Date()): { rows: ParsedRow[]; issues: RowIssue[]; headerProblems: string[] } {
  const issues: RowIssue[] = [];
  const headerProblems: string[] = [];
  if (grid.length === 0) return { rows: [], issues, headerProblems: ['The file is empty.'] };
  const header = grid[0].map((h) => cleanCell(h).toLowerCase().replace(/\s+/g, '_'));
  const idx = (c: TemplateColumn) => header.indexOf(c);
  for (const required of ['name', 'phone'] as const) if (idx(required) < 0) headerProblems.push(`Missing the "${required}" column.`);
  if (headerProblems.length) return { rows: [], issues, headerProblems };

  const rows: ParsedRow[] = [];
  grid.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const get = (c: TemplateColumn) => (idx(c) >= 0 ? cleanCell(cells[idx(c)]) : '');
    const problems: RowIssue[] = [];
    const bad = (field: string, message: string) => problems.push({ line, field, message });

    // Text fields must not start like a spreadsheet formula (they would be re-exported into Excel later).
    const textFields: TemplateColumn[] = ['name', 'email', 'city', 'state', 'tags', 'consent_source', 'consent_evidence', 'policy_version'];
    for (const f of textFields) if (FORMULA_START.test(get(f))) bad(f, 'Starts with =, +, - or @ (looks like a spreadsheet formula).');

    const name = get('name');
    if (!name) bad('name', 'Name is required.');
    let phone = '';
    try {
      phone = normalizePhoneE164(get('phone'));
    } catch (e) {
      bad('phone', (e as Error).message);
    }
    const emailRaw = get('email');
    if (emailRaw && !EMAIL.test(emailRaw)) bad('email', 'Not a valid email address.');

    const originRaw = (get('origin') || 'other').toLowerCase();
    if (!ORIGINS.includes(originRaw as (typeof ORIGINS)[number])) bad('origin', 'Use offline, online or other.');

    const consentRaw = (get('marketing_consent') || 'unknown').toLowerCase().replace(/\s+/g, '_');
    const claimedConsent = (['opted_in', 'opted_out', 'unknown'] as const).find((c) => c === consentRaw) ?? null;
    if (!claimedConsent) bad('marketing_consent', 'Use opted_in, opted_out or unknown (or leave empty).');

    const consentAtRaw = get('consent_at');
    let consentAt: string | null = null;
    if (consentAtRaw) {
      const t = new Date(consentAtRaw);
      if (Number.isNaN(t.getTime())) bad('consent_at', 'Not a valid date (use YYYY-MM-DD).');
      else if (t.getTime() > now.getTime() + 86_400_000) bad('consent_at', 'Consent date is in the future.');
      else consentAt = t.toISOString();
    }

    const tags = get('tags')
      .split(/[;,|]/)
      .map((t) => t.trim().toLowerCase().replace(/\s+/g, '-'))
      .filter(Boolean);
    if (tags.length > 10) bad('tags', 'At most 10 tags.');
    if (tags.some((t) => t.length > 30)) bad('tags', 'A tag is longer than 30 characters.');

    if (problems.length) {
      issues.push(...problems);
      return;
    }
    rows.push({
      line,
      name,
      phone,
      email: emailRaw ? emailRaw.toLowerCase() : null,
      city: get('city') || null,
      state: get('state') || null,
      origin: originRaw as ParsedRow['origin'],
      tags: [...new Set(tags)],
      claimedConsent: claimedConsent ?? 'unknown',
      consentSource: get('consent_source') || null,
      consentAt,
      consentEvidence: get('consent_evidence') || null,
      policyVersion: get('policy_version') || null,
    });
  });
  return { rows, issues, headerProblems };
}

/** What consent an import row can actually justify. */
export function resolveConsent(row: ParsedRow): { consent: Consent & { evidence?: string | null; policyVersion?: string | null }; note: string | null } {
  if (row.claimedConsent === 'opted_out') {
    return { consent: { status: 'opted_out', at: row.consentAt, source: row.consentSource ?? 'import' }, note: null };
  }
  if (row.claimedConsent === 'opted_in') {
    const missing = [!row.consentSource && 'consent source', !row.consentAt && 'consent date', !row.consentEvidence && 'evidence/reference'].filter(Boolean);
    if (missing.length === 0) {
      return {
        consent: { status: 'opted_in', at: row.consentAt, source: row.consentSource, evidence: row.consentEvidence, policyVersion: row.policyVersion },
        note: null,
      };
    }
    return { consent: { status: 'unknown', at: null, source: null }, note: `Marked opted in but missing ${missing.join(', ')}: stored as consent unknown.` };
  }
  return { consent: { status: 'unknown', at: null, source: null }, note: null };
}

export type PlanAction = 'create' | 'update' | 'unchanged' | 'skip_existing' | 'skip_duplicate_in_file' | 'invalid';

export interface PlannedRow {
  line: number;
  action: Exclude<PlanAction, 'invalid'>;
  customerId: string;
  /** Masked: a plan is shown on screen and written to reports. */
  phone: string;
  /** The full record to write (create) or the fields to merge (update). Never shown in reports. */
  write: Partial<Customer> & { id: string };
  warnings: string[];
}

export interface ImportPlan {
  strategy: ConflictStrategy;
  rows: PlannedRow[];
  issues: RowIssue[];
  headerProblems: string[];
  counts: {
    rowsInFile: number;
    create: number;
    update: number;
    unchanged: number;
    skipExisting: number;
    duplicateInFile: number;
    invalid: number;
    consentOptedIn: number;
    consentUnknown: number;
    consentOptedOut: number;
    suppressedKept: number;
  };
}

const newId = (phone: string) => customerIdForPhone(phone);

/**
 * Turns parsed rows into a plan against the customers that already exist and the suppression list.
 * `existing` maps customer id → record; `suppressed` is the set of customer ids that must never receive marketing.
 */
export function planImport(
  parsed: { rows: ParsedRow[]; issues: RowIssue[]; headerProblems: string[] },
  existing: Map<string, Customer>,
  suppressed: Set<string>,
  strategy: ConflictStrategy,
  nowIso: string,
): ImportPlan {
  const seen = new Map<string, number>();
  const rows: PlannedRow[] = [];
  const counts: ImportPlan['counts'] = {
    rowsInFile: parsed.rows.length + new Set(parsed.issues.map((i) => i.line)).size,
    create: 0,
    update: 0,
    unchanged: 0,
    skipExisting: 0,
    duplicateInFile: 0,
    invalid: new Set(parsed.issues.map((i) => i.line)).size,
    consentOptedIn: 0,
    consentUnknown: 0,
    consentOptedOut: 0,
    suppressedKept: 0,
  };

  for (const r of parsed.rows) {
    const id = newId(r.phone);
    const masked = maskPhone(r.phone);
    const first = seen.get(id);
    if (first !== undefined) {
      counts.duplicateInFile++;
      rows.push({ line: r.line, action: 'skip_duplicate_in_file', customerId: id, phone: masked, write: { id }, warnings: [`Same number as line ${first}; the first one is used.`] });
      continue;
    }
    seen.set(id, r.line);

    const warnings: string[] = [];
    const { consent: claimed, note } = resolveConsent(r);
    if (note) warnings.push(note);
    const current = existing.get(id);

    // Consent merge. An opt-out always wins; an import never downgrades an existing opt-in, never upgrades a suppressed number.
    let marketing: Consent & { evidence?: string | null; policyVersion?: string | null } = claimed;
    const isSuppressed = suppressed.has(id) || current?.consent.marketing.status === 'opted_out';
    if (isSuppressed) {
      if (claimed.status === 'opted_in') warnings.push('This number opted out earlier; the opt-out is kept.');
      counts.suppressedKept++;
      marketing = current?.consent.marketing.status === 'opted_out' ? current.consent.marketing : { status: 'opted_out', at: null, source: 'suppression_list' };
    } else if (current && claimed.status === 'unknown') {
      marketing = current.consent.marketing; // an unknown in the file never erases what is on record
    }
    counts[marketing.status === 'opted_in' ? 'consentOptedIn' : marketing.status === 'opted_out' ? 'consentOptedOut' : 'consentUnknown']++;

    const details = {
      name: r.name,
      email: r.email,
      city: r.city,
      state: r.state,
      tags: r.tags,
    };
    if (!current) {
      counts.create++;
      rows.push({
        line: r.line,
        action: 'create',
        customerId: id,
        phone: masked,
        write: {
          id,
          phone: r.phone,
          ...details,
          origin: r.origin,
          source: r.origin === 'online' ? 'online' : r.origin === 'offline' ? 'pos' : 'admin',
          stats: { onlineOrders: 0, posPurchases: 0, totalSpent: 0, lastPurchaseAt: null },
          consent: { transactional: { status: 'unknown', at: null, source: null }, marketing },
          createdAt: nowIso,
          updatedAt: nowIso,
        },
        warnings,
      });
      continue;
    }

    if (strategy === 'skip_existing') {
      counts.skipExisting++;
      rows.push({ line: r.line, action: 'skip_existing', customerId: id, phone: masked, write: { id }, warnings });
      continue;
    }
    const patch: Record<string, unknown> = {};
    const cur = current as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(details)) {
      const have = cur[k];
      const empty = have === undefined || have === null || have === '' || (Array.isArray(have) && have.length === 0);
      if (v === null || (Array.isArray(v) && v.length === 0)) continue;
      if (strategy === 'update_details' ? JSON.stringify(have) !== JSON.stringify(v) : empty) patch[k] = k === 'tags' && Array.isArray(have) && have.length ? [...new Set([...(have as string[]), ...(v as string[])])] : v;
    }
    const marketingChanged = JSON.stringify(marketing) !== JSON.stringify(current.consent.marketing);
    if (marketingChanged) patch.consent = { ...current.consent, marketing };
    if (Object.keys(patch).length === 0) {
      counts.unchanged++;
      rows.push({ line: r.line, action: 'unchanged', customerId: id, phone: masked, write: { id }, warnings });
      continue;
    }
    counts.update++;
    rows.push({ line: r.line, action: 'update', customerId: id, phone: masked, write: { id, ...patch, updatedAt: nowIso } as PlannedRow['write'], warnings });
  }
  return { strategy, rows, issues: parsed.issues, headerProblems: parsed.headerProblems, counts };
}

/** A report that is safe to hand around: line numbers, masked numbers and reasons, never names, emails or evidence. */
export function errorReportCsv(plan: ImportPlan): string {
  const lines = ['line,result,field,detail'];
  for (const i of plan.issues) lines.push([i.line, 'invalid', i.field, csvSafe(i.message)].join(','));
  for (const r of plan.rows) {
    if (['skip_duplicate_in_file', 'skip_existing'].includes(r.action)) lines.push([r.line, r.action, 'phone', csvSafe(r.phone)].join(','));
    for (const w of r.warnings) lines.push([r.line, 'warning', '', csvSafe(w)].join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

import { describe, it, expect } from 'vitest';
import { customerIdForPhone, newCustomer } from '../billing/invoice-engine';
import type { Customer } from '../schemas/billing';
import { csvSafe, errorReportCsv, ImportFileError, IMPORT_LIMITS, maskPhone, normalizePhoneE164, parseContactRows, parseCsv, planImport, resolveConsent, templateCsv } from './contact-import';

const NOW = new Date('2026-10-18T00:00:00Z');
const NOW_ISO = NOW.toISOString();
const run = (csv: string, existing: Customer[] = [], suppressed: string[] = [], strategy: 'skip_existing' | 'fill_empty' | 'update_details' = 'skip_existing') =>
  planImport(parseContactRows(parseCsv(csv), NOW), new Map(existing.map((c) => [c.id, c])), new Set(suppressed), strategy, NOW_ISO);
const HEAD = 'name,phone,email,city,state,origin,tags,marketing_consent,consent_source,consent_at,consent_evidence,policy_version\n';

describe('CSV parsing', () => {
  it('parses quotes, commas inside quotes, CRLF and a BOM', () => {
    const g = parseCsv('﻿name,phone\r\n"Raman, K","98765 43210"\r\n"He said ""hi""",9812345678\r\n');
    expect(g).toEqual([['name', 'phone'], ['Raman, K', '98765 43210'], ['He said "hi"', '9812345678']]);
  });
  it('refuses binary content, oversized files, too many rows and an unclosed quote', () => {
    expect(() => parseCsv('PK\u0003\u0004\u0000\u0000')).toThrow(ImportFileError);
    expect(() => parseCsv('a'.repeat(IMPORT_LIMITS.maxBytes + 1))).toThrow(/larger than/);
    expect(() => parseCsv('n,p\n' + 'a,b\n'.repeat(IMPORT_LIMITS.maxRows + 5))).toThrow(/More than/);
    expect(() => parseCsv('name,phone\n"open,9812345678')).toThrow(/unclosed/);
  });
  it('the downloadable template parses with no problems', () => {
    const plan = run(templateCsv());
    expect(plan.issues).toEqual([]);
    expect(plan.counts.create).toBe(2);
  });
});

describe('phone numbers', () => {
  it.each([['9876543210', '+919876543210'], ['+91 98765-43210', '+919876543210'], ['09876543210', '+919876543210'], ['919876543210', '+919876543210'], ['+44 7911 123456', '+447911123456'], ['0044 7911 123456', '+447911123456']])('%s → %s', (input, out) => {
    expect(normalizePhoneE164(input)).toBe(out);
  });
  it.each(['12345', '5876543210', '+91 12345 67890', '+0123456789', 'abc', '', '98765432101234567890'])('rejects %j', (input) => {
    expect(() => normalizePhoneE164(input)).toThrow();
  });
  it('masks to the last four digits', () => expect(maskPhone('+919876543210')).toBe('••••3210'));
});

describe('validation', () => {
  it('reports each bad row with its line and field, and still keeps the good rows', () => {
    const plan = run(HEAD + 'Good One,9876543210,,,,offline,,,,,,\n,9876543211,,,,,,,,,,\nBad Phone,123,,,,,,,,,,\nBad Mail,9876543212,nope,,,,,,,,,\nBad Origin,9876543213,,,,shop,,,,,,\nBad Date,9876543214,,,,,,opted_in,form,31-31-2026,ref,\n');
    expect(plan.counts.create).toBe(1);
    expect(plan.issues.map((i) => `${i.line}:${i.field}`).sort()).toEqual(['3:name', '4:phone', '5:email', '6:origin', '7:consent_at']);
  });
  it('flags missing required columns', () => {
    const p = parseContactRows(parseCsv('fullname,mobile\nA,9876543210\n'), NOW);
    expect(p.headerProblems).toEqual(['Missing the "name" column.', 'Missing the "phone" column.']);
  });
  it('accepts columns in any order and ignores unknown ones', () => {
    const plan = run('Phone,Notes,Name\n9876543210,secret note,Asha\n');
    expect(plan.counts.create).toBe(1);
    expect(JSON.stringify(plan.rows[0].write)).not.toContain('secret note');
  });
  it('rejects text cells that start like a spreadsheet formula', () => {
    const plan = run(HEAD + '=HYPERLINK("http://evil"),9876543210,,,,,,,,,,\nOk Name,9876543211,,@SUM(A1),,,,,,,,\n');
    expect(plan.counts.create).toBe(0);
    expect(plan.issues).toHaveLength(2);
  });
  it('a future consent date is refused', () => {
    expect(run(HEAD + 'A,9876543210,,,,,,opted_in,form,2027-01-01,ref,\n').issues[0].field).toBe('consent_at');
  });
});

describe('consent: a phone number is never consent', () => {
  it('no consent column means consent unknown', () => {
    const plan = run('name,phone\nAsha,9876543210\n');
    expect(plan.rows[0].write.consent!.marketing.status).toBe('unknown');
    expect(plan.counts.consentUnknown).toBe(1);
  });
  it('"opted_in" without a source, a date and evidence is stored as unknown, with a warning, and no date is invented', () => {
    const plan = run(HEAD + 'A,9876543210,,,,,,opted_in,,,,\nB,9876543211,,,,,,opted_in,form,2026-01-01,,\n');
    for (const r of plan.rows) {
      expect(r.write.consent!.marketing).toEqual({ status: 'unknown', at: null, source: null });
      expect(r.warnings[0]).toMatch(/stored as consent unknown/);
    }
    expect(plan.counts.consentOptedIn).toBe(0);
  });
  it('opted in with source, date and evidence is kept as given, with the evidence recorded', () => {
    const plan = run(HEAD + 'A,9876543210,,,,,,opted_in,signup form,2026-01-15,Form 123,v2\n');
    expect(plan.rows[0].write.consent!.marketing).toEqual({ status: 'opted_in', at: '2026-01-15T00:00:00.000Z', source: 'signup form', evidence: 'Form 123', policyVersion: 'v2' });
  });
  it('an opt-out in the file is always honoured', () => {
    expect(resolveConsent({ ...parsedRow(), claimedConsent: 'opted_out' }).consent.status).toBe('opted_out');
  });
  it('transactional consent is never granted by an import', () => {
    const plan = run(HEAD + 'A,9876543210,,,,,,opted_in,form,2026-01-15,ref,v1\n');
    expect(plan.rows[0].write.consent!.transactional.status).toBe('unknown');
  });
});

function parsedRow() {
  return parseContactRows(parseCsv('name,phone\nA,9876543210\n'), NOW).rows[0];
}

const existingCustomer = (over: Partial<Customer> = {}): Customer => ({ ...newCustomer({ phone: '+919876543210', name: 'Old Name', source: 'pos' }, '2026-01-01T00:00:00Z'), ...over });

describe('duplicates and existing customers', () => {
  it('a number twice in the file: the first row wins, the second is reported', () => {
    const plan = run('name,phone\nFirst,9876543210\nSecond,+91 98765 43210\n');
    expect(plan.counts.create).toBe(1);
    expect(plan.counts.duplicateInFile).toBe(1);
    expect(plan.rows[1].warnings[0]).toMatch(/line 2/);
  });
  it('skip_existing leaves an existing customer untouched', () => {
    const plan = run('name,phone,city\nNew Name,9876543210,Madurai\n', [existingCustomer()]);
    expect(plan.rows[0].action).toBe('skip_existing');
    expect(plan.counts.skipExisting).toBe(1);
  });
  it('fill_empty only fills fields the customer record lacks', () => {
    const plan = run('name,phone,city,state\nNew Name,9876543210,Madurai,Tamil Nadu\n', [existingCustomer({ city: 'Chennai' })], [], 'fill_empty');
    expect(plan.rows[0].action).toBe('update');
    expect(plan.rows[0].write).toMatchObject({ state: 'Tamil Nadu' });
    expect(plan.rows[0].write).not.toHaveProperty('city');
    expect(plan.rows[0].write).not.toHaveProperty('name');
  });
  it('update_details overwrites listed details but leaves stats and ids alone', () => {
    const plan = run('name,phone,city\nNew Name,9876543210,Madurai\n', [existingCustomer({ city: 'Chennai' })], [], 'update_details');
    expect(plan.rows[0].write).toMatchObject({ name: 'New Name', city: 'Madurai' });
    expect(plan.rows[0].write).not.toHaveProperty('stats');
  });
  it('re-importing the same data changes nothing', () => {
    const c = existingCustomer({ city: 'Madurai' });
    const plan = run('name,phone,city\nOld Name,9876543210,Madurai\n', [c], [], 'update_details');
    expect(plan.rows[0].action).toBe('unchanged');
  });
});

describe('opt-outs survive re-imports', () => {
  const optedOut = existingCustomer({ consent: { transactional: { status: 'unknown', at: null, source: null }, marketing: { status: 'opted_out', at: '2026-02-01T00:00:00.000Z', source: 'whatsapp_reply' } } });
  it('an opted-out customer stays opted out even when the file says opted_in with full evidence', () => {
    const plan = run(HEAD + 'Old Name,9876543210,,,,,,opted_in,form,2026-05-01,ref,v1\n', [optedOut], [], 'update_details');
    const marketing = (plan.rows[0].write.consent ?? optedOut.consent).marketing;
    expect(marketing.status).toBe('opted_out');
    expect(plan.rows[0].warnings.join(' ')).toMatch(/opt-out is kept/);
    expect(plan.counts.suppressedKept).toBe(1);
  });
  it('a number on the suppression list is created as opted out, not unknown or opted in', () => {
    const id = customerIdForPhone('+919876543210');
    const plan = run(HEAD + 'New,9876543210,,,,,,opted_in,form,2026-05-01,ref,v1\n', [], [id]);
    expect(plan.rows[0].action).toBe('create');
    expect(plan.rows[0].write.consent!.marketing.status).toBe('opted_out');
  });
  it('an unknown in the file never erases an existing opt-in', () => {
    const optedIn = existingCustomer({ consent: { transactional: { status: 'unknown', at: null, source: null }, marketing: { status: 'opted_in', at: '2026-01-01T00:00:00.000Z', source: 'form', evidence: 'F1' } } });
    const plan = run('name,phone\nOld Name,9876543210\n', [optedIn], [], 'update_details');
    expect(plan.rows[0].action).toBe('unchanged');
  });
});

describe('reports', () => {
  it('the error report holds line numbers, masked numbers and reasons only', () => {
    const plan = run('name,phone,email\nAsha Kumar,9876543210,asha@example.com\nBad,123,\nAsha Kumar,9876543210,\n');
    const csv = errorReportCsv(plan);
    expect(csv).toContain('3,invalid,phone');
    expect(csv).toContain('••••3210');
    expect(csv).not.toMatch(/Asha|asha@|9876543210/);
  });
  it('csvSafe neutralises formulas and quotes awkward cells', () => {
    expect(csvSafe('=1+1')).toBe("'=1+1");
    expect(csvSafe('a,b')).toBe('"a,b"');
    expect(csvSafe('plain')).toBe('plain');
  });
  it('a large valid import is planned within the limits', () => {
    const rows = Array.from({ length: 1500 }, (_, i) => `Cust ${i},${9000000000 + i}`).join('\n');
    const plan = run('name,phone\n' + rows + '\n');
    expect(plan.counts.create).toBe(1500);
  });
});

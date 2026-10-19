import { describe, it, expect } from 'vitest';
import { describeTemplates, validateTemplateInput, type TemplateRecord } from './template-registry';
import { TEMPLATE_SPECS, templateNameFor } from './templates';

describe('template input', () => {
  const ok = { name: 'karthys_festival_offer', language: 'en', category: 'MARKETING', status: 'approved' };
  it('accepts a well-formed record', () => expect(validateTemplateInput(ok).ok).toBe(true));
  it.each([[{ ...ok, name: 'Has Spaces' }], [{ ...ok, name: '' }], [{ ...ok, language: 'english' }], [{ ...ok, category: 'PROMO' }], [{ ...ok, status: 'maybe' }]])('rejects %j', (bad) => {
    expect(validateTemplateInput(bad).ok).toBe(false);
  });
});

describe('the template list the code sends', () => {
  it('every template has a valid default name, variables and a category; the OTP one is AUTHENTICATION and the offer is MARKETING', () => {
    for (const t of TEMPLATE_SPECS) {
      expect(t.defaultName).toMatch(/^[a-z0-9_]+$/);
      expect(t.variables.length).toBeGreaterThan(0);
    }
    expect(TEMPLATE_SPECS.find((t) => t.key === 'otp')!.category).toBe('AUTHENTICATION');
    expect(TEMPLATE_SPECS.find((t) => t.key === 'marketing_offer')!.category).toBe('MARKETING');
    expect(TEMPLATE_SPECS.filter((t) => t.purpose === 'transactional').every((t) => t.category === 'UTILITY')).toBe(true);
  });
  it('a variable count in the suggested body matches the variables listed', () => {
    for (const t of TEMPLATE_SPECS) expect((t.suggestedBody.match(/\{\{\d+\}\}/g) ?? []).length).toBe(t.variables.length);
  });
  it('an environment variable overrides the name', () => {
    expect(templateNameFor('order_confirmed', { WHATSAPP_TEMPLATE_ORDER_CONFIRMED: 'custom_name' })).toBe('custom_name');
    expect(templateNameFor('order_confirmed', {})).toBe('karthys_order_confirmed');
  });
  it('shows "not recorded" until an administrator records a status, and flags a category mismatch', () => {
    const rec: TemplateRecord = { id: 'x', name: 'karthys_order_confirmed', language: 'en', category: 'MARKETING', status: 'approved', verifiedAt: '2026-10-18T00:00:00Z', verifiedBy: 'a', note: null };
    const d = describeTemplates([rec], {});
    expect(d.find((t) => t.key === 'order_shipped')!.recorded).toBeNull();
    expect(d.find((t) => t.key === 'order_confirmed')!.categoryMatches).toBe(false);
  });
});

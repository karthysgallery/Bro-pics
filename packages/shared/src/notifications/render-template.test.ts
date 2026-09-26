import { describe, it, expect } from 'vitest';
import { renderNotificationTemplate } from './render-template';

const template = {
  subject: 'Order {{orderNo}} update',
  body: 'Hi {{customerName}}, your order {{orderNo}} status is {{status}}.',
  variables: ['orderNo', 'customerName'],
};

describe('renderNotificationTemplate', () => {
  it('substitutes every whitelisted variable that has a value', () => {
    const result = renderNotificationTemplate(template, { orderNo: 'BP-2026-00001', customerName: 'Priya' });
    expect(result.subject).toBe('Order BP-2026-00001 update');
    expect(result.body).toBe('Hi Priya, your order BP-2026-00001 status is {{status}}.');
  });

  it('leaves a whitelisted placeholder untouched when no value is given for it', () => {
    const result = renderNotificationTemplate(template, { orderNo: 'BP-2026-00001' });
    expect(result.body).toContain('{{customerName}}');
  });

  it('never substitutes a placeholder not in the whitelist, even if a value is supplied', () => {
    const result = renderNotificationTemplate(template, { orderNo: 'x', customerName: 'y', status: 'shipped' });
    expect(result.body).toContain('{{status}}');
  });

  it('returns the text unchanged when it has no placeholders', () => {
    const flat = { subject: 'Welcome', body: 'Thanks for signing up.', variables: [] };
    expect(renderNotificationTemplate(flat, {})).toEqual({ subject: 'Welcome', body: 'Thanks for signing up.' });
  });
});

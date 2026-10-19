import { describe, it, expect } from 'vitest';
import { isRetryableError, orderEventsFromChange, planOrderMessage, retryDelaySeconds, safeVar, type OrderFields } from './order-notifications';

const base: OrderFields = { orderNo: 'BP-2026-00007', status: 'pending_payment', paymentStatus: 'pending', total: 129900, customerName: 'Asha Kumar', addressJson: { phone: '+919876543210' } };

describe('which changes produce a message', () => {
  it('a verified payment (paymentStatus paid, past pending_payment) confirms the order, once', () => {
    expect(orderEventsFromChange(base, { ...base, paymentStatus: 'paid', status: 'payment_confirmed' })).toEqual(['order_confirmed']);
    expect(orderEventsFromChange({ ...base, paymentStatus: 'paid', status: 'payment_confirmed' }, { ...base, paymentStatus: 'paid', status: 'print_rendering' })).toEqual([]);
  });
  it('never before payment: creating the order or a failed payment sends nothing', () => {
    expect(orderEventsFromChange(undefined, base)).toEqual([]);
    expect(orderEventsFromChange(base, { ...base, paymentStatus: 'failed' })).toEqual([]);
  });
  it('production start, delivery, cancellation and refund each map to their own event', () => {
    const paid = { ...base, paymentStatus: 'paid', status: 'print_ready' };
    expect(orderEventsFromChange(paid, { ...paid, status: 'in_production' })).toEqual(['order_processing']);
    expect(orderEventsFromChange(paid, { ...paid, status: 'delivered' })).toEqual(['order_delivered']);
    expect(orderEventsFromChange(paid, { ...paid, status: 'cancelled' })).toEqual(['order_cancelled']);
    expect(orderEventsFromChange(paid, { ...paid, status: 'refunded' })).toEqual(['refund_status']);
  });
  it('dispatch needs a recorded courier and tracking number', () => {
    const paid = { ...base, paymentStatus: 'paid', status: 'packed' };
    expect(orderEventsFromChange(paid, { ...paid, status: 'shipped' })).toEqual([]);
    expect(orderEventsFromChange(paid, { ...paid, status: 'shipped', shipmentTracking: { provider: 'DTDC', awbNumber: 'D123' } })).toEqual(['order_shipped']);
  });
  it('internal sub-stages send nothing', () => {
    const paid = { ...base, paymentStatus: 'paid' };
    for (const status of ['payment_confirmed', 'photo_validation', 'print_rendering', 'print_ready', 'quality_check', 'packed']) {
      expect(orderEventsFromChange({ ...paid, status: 'x' }, { ...paid, status })).toEqual([]);
    }
  });
});

describe('what is sent', () => {
  it('confirmation carries first name, order number and the amount from the order', () => {
    expect(planOrderMessage('order_confirmed', base)).toEqual({ ok: true, to: '+919876543210', template: 'order_confirmed', variables: ['Asha', 'BP-2026-00007', '1,299.00'] });
  });
  it('shipping uses only the real tracking link; with none, it says so instead of inventing one', () => {
    const withLink = planOrderMessage('order_shipped', { ...base, shipmentTracking: { provider: 'DTDC', awbNumber: 'D123', trackingUrl: 'https://track.example/D123' } });
    expect(withLink).toMatchObject({ ok: true, variables: ['Asha', 'BP-2026-00007', 'DTDC', 'D123', 'Track it here: https://track.example/D123'] });
    const noLink = planOrderMessage('order_shipped', { ...base, shipmentTracking: { provider: 'DTDC', awbNumber: 'D123', trackingUrl: null } });
    expect(noLink).toMatchObject({ ok: true });
    expect(JSON.stringify(noLink)).not.toMatch(/https?:/);
    expect(planOrderMessage('order_shipped', base)).toEqual({ ok: false, reason: 'No courier and tracking number recorded.' });
  });
  it('a non-https tracking URL is not used', () => {
    const r = planOrderMessage('order_shipped', { ...base, shipmentTracking: { provider: 'X', awbNumber: 'Y', trackingUrl: 'javascript:alert(1)' } });
    expect(JSON.stringify(r)).not.toContain('javascript');
  });
  it('refuses when there is no valid number or order number', () => {
    expect(planOrderMessage('order_delivered', { ...base, addressJson: { phone: '123' } })).toMatchObject({ ok: false });
    expect(planOrderMessage('order_delivered', { ...base, orderNo: undefined })).toMatchObject({ ok: false });
  });
  it('customer-supplied text is flattened before it reaches a template variable', () => {
    expect(safeVar('Asha\nKumar\t{{1}}\u0000', 40)).toBe('Asha Kumar {{1}}');
    const r = planOrderMessage('order_delivered', { ...base, customerName: 'Evil\nName '.repeat(30) });
    expect(r.ok && r.variables[0].length).toBeLessThanOrEqual(40);
    expect(r.ok && r.variables[0]).not.toMatch(/\n/);
  });
});

describe('retries', () => {
  it('backs off 5 min, 30 min, 2 h and then stops', () => {
    expect([1, 2, 3, 4].map(retryDelaySeconds)).toEqual([300, 1800, 7200, null]);
  });
  it('retries network, server and throttling errors but not template, number or permission errors', () => {
    expect(isRetryableError('WhatsApp: HTTP 503')).toBe(true);
    expect(isRetryableError('WhatsApp: Too many messages (code 130429)')).toBe(true);
    expect(isRetryableError('fetch failed')).toBe(true);
    expect(isRetryableError('WhatsApp: Template name does not exist (code 132001)')).toBe(false);
    expect(isRetryableError('WhatsApp: Message undeliverable (code 131026)')).toBe(false);
    expect(isRetryableError('WhatsApp: Invalid OAuth access token. (code 190)')).toBe(false);
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('loadRazorpayCheckoutScript', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    // Reset the module registry so each test gets a fresh module-level
    // `loadPromise` cache — otherwise the cache (which is not tied to the
    // DOM) leaks across tests even though document.head is cleared above.
    vi.resetModules();
  });

  it('appends a script tag pointing at Razorpay checkout.js', async () => {
    const { loadRazorpayCheckoutScript } = await import('./razorpay-checkout-script');
    const promise = loadRazorpayCheckoutScript();
    const script = document.querySelector('script[src*="checkout.razorpay.com"]');
    expect(script).not.toBeNull();
    script?.dispatchEvent(new Event('load'));
    await expect(promise).resolves.toBeUndefined();
  });

  it('does not append a second script tag if one already exists', async () => {
    const { loadRazorpayCheckoutScript } = await import('./razorpay-checkout-script');
    const first = loadRazorpayCheckoutScript();
    document.querySelector('script[src*="checkout.razorpay.com"]')?.dispatchEvent(new Event('load'));
    await first;

    await loadRazorpayCheckoutScript();
    const scripts = document.querySelectorAll('script[src*="checkout.razorpay.com"]');
    expect(scripts.length).toBe(1);
  });
});

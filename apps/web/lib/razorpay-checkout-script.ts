'use client';

let loadPromise: Promise<void> | null = null;

export function loadRazorpayCheckoutScript(): Promise<void> {
  if (loadPromise) return loadPromise;

  const existing = document.querySelector('script[src*="checkout.razorpay.com"]');
  if (existing) {
    loadPromise = Promise.resolve();
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay checkout script'));
    document.head.appendChild(script);
  });
  return loadPromise;
}

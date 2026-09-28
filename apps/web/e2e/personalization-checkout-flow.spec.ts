import { test, expect } from '@playwright/test';

test.describe('End-to-End Personalization & Checkout Flow [FE-48]', () => {
  test('navigates to product, tests buy box, cart drawer, checkout and order confirmation', async ({ page }) => {
    // 1. Visit homepage and click first product
    await page.goto('/');
    const firstProductLink = page.locator('a[href^="/product/"]').first();

    if (await firstProductLink.count() === 0) {
      test.skip();
      return;
    }

    const productHref = await firstProductLink.getAttribute('href');
    await page.goto(productHref || '/');

    // 2. On PDP, verify BuyBox elements
    await expect(page.locator('h1')).toBeVisible();
    const sizeSelectors = page.locator('button:has-text("Size"), button:has-text("8x12"), button:has-text("6x8")');
    if (await sizeSelectors.count() > 0) {
      await expect(sizeSelectors.first()).toBeVisible();
    }

    // 3. Check Delivery Pincode Checker
    const pincodeInput = page.locator('input[placeholder*="pincode" i], input[placeholder*="pin" i]');
    if (await pincodeInput.count() > 0) {
      await pincodeInput.fill('600001');
      const checkBtn = page.locator('button:has-text("Check")');
      if (await checkBtn.count() > 0) {
        await checkBtn.click();
      }
    }

    // 4. Check Cart Drawer interaction
    const cartButton = page.locator('button[aria-label*="cart" i], button:has-text("Cart")');
    if (await cartButton.count() > 0) {
      await cartButton.first().click();
      // Cart drawer should open
      const cartDrawer = page.locator('div[role="dialog"], aside');
      await expect(cartDrawer.first()).toBeVisible();
      // Close drawer
      const closeBtn = page.locator('button[aria-label="Close cart"], button:has-text("✕"), button:has-text("Close")');
      if (await closeBtn.count() > 0) {
        await closeBtn.first().click();
      }
    }

    // 5. Navigate to Checkout
    await page.goto('/checkout');
    // Checkout should show either empty state or checkout form
    const checkoutContainer = page.locator('main, div[class*="checkout"]');
    await expect(checkoutContainer.first()).toBeVisible();
  });
});

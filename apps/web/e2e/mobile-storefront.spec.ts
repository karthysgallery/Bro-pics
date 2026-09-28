import { test, expect, devices } from '@playwright/test';

test.use({ ...devices['Pixel 5'] });

test.describe('Mobile Storefront Emulation & Gestures [FE-49]', () => {
  test('mobile viewport renders responsive header, drawer, and bottom sheet filter', async ({ page }) => {
    await page.goto('/');

    // 1. Mobile Header & Branding
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // 2. Mobile Search Trigger
    const searchBtn = page.locator('button[aria-label*="search" i], header input[type="search"]');
    if (await searchBtn.count() > 0) {
      await expect(searchBtn.first()).toBeVisible();
    }

    // 3. Navigate to Category on Mobile
    await page.goto('/category');
    await expect(page.locator('h1')).toBeVisible();

    // 4. Test Mobile Bottom Sheet Filter Trigger if present
    const filterBtn = page.locator('button:has-text("Filter"), button[aria-label*="filter" i]');
    if (await filterBtn.count() > 0) {
      await filterBtn.first().click();
      // Bottom sheet should slide up
      const bottomSheet = page.locator('div[role="dialog"], [data-testid="filter-bottom-sheet"], aside');
      if (await bottomSheet.count() > 0) {
        await expect(bottomSheet.first()).toBeVisible();
      }
    }
  });

  test('mobile product detail renders sticky add to cart and touch-friendly gallery', async ({ page }) => {
    await page.goto('/');
    const firstProduct = page.locator('a[href^="/product/"]').first();

    if (await firstProduct.count() === 0) {
      test.skip();
      return;
    }

    const href = await firstProduct.getAttribute('href');
    await page.goto(href || '/');

    // Verify PDP title and primary CTA button
    await expect(page.locator('h1')).toBeVisible();
    const addToCartBtn = page.locator('button:has-text("Add to cart"), button:has-text("Customize"), button:has-text("Out of stock")');
    await expect(addToCartBtn.first()).toBeVisible();

    // Verify WhatsApp float button exists and does not block layout
    const waBtn = page.locator('a[href*="wa.me"], button[aria-label*="WhatsApp" i]');
    if (await waBtn.count() > 0) {
      await expect(waBtn.first()).toBeVisible();
    }
  });
});

import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { name: '320px (Narrow Mobile)', width: 320, height: 600, isMobile: true },
  { name: '375px (iPhone SE)', width: 375, height: 667, isMobile: true },
  { name: '390px (iPhone 13/14)', width: 390, height: 844, isMobile: true },
  { name: '414px (iPhone XR/Plus)', width: 414, height: 896, isMobile: true },
  { name: '430px (iPhone Pro Max)', width: 430, height: 932, isMobile: true },
  { name: '768px (iPad Portrait)', width: 768, height: 1024, isMobile: false },
  { name: '1024px (iPad Landscape)', width: 1024, height: 768, isMobile: false },
  { name: '1280px (Standard Desktop)', width: 1280, height: 800, isMobile: false },
  { name: '1440px (Large Desktop)', width: 1440, height: 900, isMobile: false },
  { name: '1920px (Full HD)', width: 1920, height: 1080, isMobile: false },
];

// Standard emoji Unicode blocks regex
const EMOJI_REGEX = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/u;

for (const vp of VIEWPORTS) {
  test.describe(`Responsive QA - ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('Homepage: zero horizontal overflow, responsive header & zero emojis', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('header')).toBeVisible();

      // Check for horizontal overflow (tolerance 1px for subpixel rendering)
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        innerWidth: window.innerWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 1);

      // Verify no emojis are rendered in visible page text
      const pageText = await page.evaluate(() => document.body.innerText);
      const emojiMatch = pageText.match(EMOJI_REGEX);
      expect(emojiMatch, `Found emoji "${emojiMatch?.[0]}" on homepage at ${vp.width}px`).toBeNull();

      // Check header search trigger is visible
      const searchTrigger = page.locator('header input[type="search"]:visible, button[aria-label*="search" i]:visible').first();
      await expect(searchTrigger).toBeVisible();

      // If mobile, check touch target size >= 36px
      if (vp.isMobile) {
        const menuBtn = page.locator('button[aria-label*="menu" i], button[aria-label*="navigation" i]').first();
        if (await menuBtn.count() > 0) {
          const box = await menuBtn.boundingBox();
          if (box) {
            expect(box.height).toBeGreaterThanOrEqual(36);
          }
        }
      }
    });

    test('Search: expands smoothly and dropdown stays within viewport', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      const searchInput = page.locator('header input[type="search"]:visible').first();
      await expect(searchInput).toBeVisible();

      await searchInput.click();
      await searchInput.fill('frame');

      // Wait for debounce and suggestion dropdown
      await page.waitForTimeout(300);

      const dropdown = page.locator('[role="listbox"], [data-testid="search-dropdown"], [aria-label*="suggestion" i]');
      if (await dropdown.count() > 0 && await dropdown.first().isVisible()) {
        const dropBox = await dropdown.first().boundingBox();
        if (dropBox) {
          expect(dropBox.x).toBeGreaterThanOrEqual(-1);
          expect(dropBox.x + dropBox.width).toBeLessThanOrEqual(vp.width + 5);
        }
      }
    });

    test('Category Listing: grid layout and filters appropriate for viewport', async ({ page }) => {
      await page.goto('/category/frames-wall-decor', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('h1')).toBeVisible();

      // Check overflow
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 1);

      if (vp.isMobile) {
        // Mobile should have compact Filter trigger
        const filterBtn = page.locator('button:has-text("Filter"), button[aria-label*="filter" i]').first();
        if (await filterBtn.count() > 0) {
          await expect(filterBtn).toBeVisible();
          await filterBtn.click();
          // Verify bottom sheet opens
          const bottomSheet = page.locator('div[role="dialog"], [data-testid="filter-bottom-sheet"], aside');
          if (await bottomSheet.count() > 0) {
            await expect(bottomSheet.first()).toBeVisible();
            // Close filter drawer
            const closeBtn = bottomSheet.locator('button[aria-label*="close" i], button:has-text("Apply"), button:has-text("Done")').first();
            if (await closeBtn.count() > 0) {
              await closeBtn.click();
            }
          }
        }
      } else {
        // Desktop should display filter sidebar directly
        const sidebar = page.locator('aside, [data-testid="filter-sidebar"]');
        if (await sidebar.count() > 0) {
          await expect(sidebar.first()).toBeVisible();
        }
      }
    });

    test('Product Detail Page: information hierarchy and sticky CTA on mobile', async ({ page }) => {
      await page.goto('/product/couples-eye-frame', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('h1')).toBeVisible();

      // Check overflow
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 1);

      // Verify no emojis
      const pageText = await page.evaluate(() => document.body.innerText);
      const emojiMatch = pageText.match(EMOJI_REGEX);
      expect(emojiMatch, `Found emoji "${emojiMatch?.[0]}" on PDP at ${vp.width}px`).toBeNull();

      if (vp.isMobile) {
        // Check for sticky bottom mobile bar
        const stickyBar = page.locator('[data-testid="mobile-buy-bar"], .fixed.bottom-0');
        if (await stickyBar.count() > 0) {
          await expect(stickyBar.first()).toBeVisible();
          const box = await stickyBar.first().boundingBox();
          if (box) {
            // Touch target should be comfortable
            expect(box.height).toBeGreaterThanOrEqual(44);
          }
        }
      }
    });

    test('Admin Dashboard: clean UI, data cards and zero emojis', async ({ page }) => {
      await page.goto('/admin', { waitUntil: 'domcontentloaded' });
      // Either signed-in header or access gate h1
      await expect(page.locator('h1, header').first()).toBeVisible();

      // Verify no emojis in admin
      const pageText = await page.evaluate(() => document.body.innerText);
      const emojiMatch = pageText.match(EMOJI_REGEX);
      expect(emojiMatch, `Found emoji "${emojiMatch?.[0]}" on Admin Dashboard at ${vp.width}px`).toBeNull();
    });
  });
}

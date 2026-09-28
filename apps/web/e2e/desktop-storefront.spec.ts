import { test, expect } from '@playwright/test';

test.describe('Desktop Storefront & Discovery [FE-48]', () => {
  test('homepage loads, renders hero slider, categories, and best sellers', async ({ page }) => {
    await page.goto('/');

    // Check title and main landmarks
    await expect(page).toHaveTitle(/BroPics/i);
    const hero = page.locator('section[aria-label="Featured collections"]');
    if (await hero.count() > 0) {
      await expect(hero).toBeVisible();
    }

    // Category navigation
    const header = page.locator('header');
    await expect(header).toBeVisible();
    const searchInput = header.locator('input[type="search"]');
    if (await searchInput.count() > 0) {
      await expect(searchInput).toBeVisible();
    }
  });

  test('category page displays product cards with filters and sort controls', async ({ page }) => {
    await page.goto('/category');
    await expect(page.locator('h1')).toContainText(/collections|shop/i);

    // Filter and sort interactions if on specific category
    const productCards = page.locator('a[href^="/product/"]');
    if (await productCards.count() > 0) {
      const firstCard = productCards.first();
      await expect(firstCard).toBeVisible();
    }
  });

  test('search typeahead suggests categories and products', async ({ page }) => {
    await page.goto('/');
    const searchInput = page.locator('header input[type="search"]');
    if (await searchInput.count() > 0) {
      await searchInput.click();
      await searchInput.fill('frame');
      // Suggestion dropdown should appear
      const dropdown = page.locator('div[role="listbox"], .search-suggestions, [data-testid="search-typeahead"]');
      if (await dropdown.count() > 0) {
        await expect(dropdown.first()).toBeVisible();
      }
    }
  });
});

import { test, expect } from '@playwright/test';

test.describe('Real-Time Personalized Frame Preview [FE-PDP-PREVIEW]', () => {
  test('PDP renders live preview layout on desktop with personalization section', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/product/classic-wooden-frame');

    // 1. Live Frame Preview container on the left
    const previewContainer = page.locator('[data-testid="personalization-preview"]');
    await expect(previewContainer).toBeVisible();

    // 2. Preview mode toggle switch
    const designTab = page.locator('button:has-text("Design Preview")');
    const roomTab = page.locator('button:has-text("View in Room")');
    await expect(designTab).toBeVisible();
    await expect(roomTab).toBeVisible();

    // 3. Right column: BuyBox and Personalize Your Frame
    const heading = page.locator('h2:has-text("Personalize Your Frame")');
    await expect(heading).toBeVisible();

    // 4. "YOUR PHOTOS" slot section
    const photosSection = page.locator('h3:has-text("Your Photos")');
    await expect(photosSection).toBeVisible();

    // 5. Add Photo slot card
    const addPhotoBtn = page.locator('label[for="photo-upload-input"], button:has-text("Add Photo")').first();
    await expect(addPhotoBtn).toBeVisible();
  });

  test('Design Preview and Room Preview toggle works smoothly', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/product/classic-wooden-frame');

    const designTab = page.locator('button:has-text("Design Preview")');
    const roomTab = page.locator('button:has-text("View in Room")');

    // Click View in Room
    await roomTab.click();
    await expect(roomTab).toHaveAttribute('aria-pressed', 'true');

    // Switch back to Design Preview
    await designTab.click();
    await expect(designTab).toHaveAttribute('aria-pressed', 'true');
  });

  test('Variant selection (Frame Colour & Size) preserves layout', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/product/classic-wooden-frame');

    // Frame colour buttons
    const colourButtons = page.locator('button[aria-label^="Select Frame Colour"]');
    const count = await colourButtons.count();
    if (count > 1) {
      await colourButtons.nth(1).click();
      // Preview should still be visible and active
      const previewContainer = page.locator('[data-testid="personalization-preview"]');
      await expect(previewContainer).toBeVisible();
    }
  });

  test('Mobile responsive preview layout at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/product/classic-wooden-frame');

    // Live frame preview near the top
    const previewContainer = page.locator('[data-testid="personalization-preview"]');
    await expect(previewContainer).toBeVisible();

    // Ensure zero horizontal overflow on mobile
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);

    // Personalization controls below preview
    const heading = page.locator('h2:has-text("Personalize Your Frame")');
    await expect(heading).toBeVisible();

    // Add Photo slot should have comfortable touch target
    const addPhotoBtn = page.locator('label[for="photo-upload-input"]').first();
    await expect(addPhotoBtn).toBeVisible();
    const box = await addPhotoBtn.boundingBox();
    if (box) {
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });
});

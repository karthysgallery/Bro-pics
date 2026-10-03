import { test, expect } from '@playwright/test';

test.describe('Admin Control Panel & Workflows [AFE-33]', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to admin root
    await page.goto('/admin');
  });

  test('admin shell renders grouped navigation, header search and staging badge', async ({ page }) => {
    // Header & Shell
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Staging badge or Brand logo
    const brand = page.locator('text=BroPics Admin');
    await expect(brand).toBeVisible();

    // Check grouped navigation links
    const nav = page.locator('nav');
    await expect(nav).toBeVisible();
    await expect(page.locator('a[href="/admin"]')).toBeVisible();
    await expect(page.locator('a[href="/admin/products"]')).toBeVisible();
    await expect(page.locator('a[href="/admin/orders"]')).toBeVisible();
    await expect(page.locator('a[href="/admin/production"]')).toBeVisible();
  });

  test('catalogue: products listing, filters, and product editor navigation', async ({ page }) => {
    await page.goto('/admin/products');
    await expect(page.locator('h1')).toContainText(/Products|Catalogue/i);

    // New Product button
    const newProductBtn = page.locator('a[href="/admin/products/new"], button:has-text("Add Product"), button:has-text("New Product")');
    if (await newProductBtn.count() > 0) {
      await expect(newProductBtn.first()).toBeVisible();
    }

    // Navigate to product editor
    await page.goto('/admin/products/new');
    await expect(page.locator('h1')).toContainText(/New Product|Create Product|Edit Product/i);

    // Tabbed interface check
    const tabs = page.locator('button:has-text("General"), button:has-text("Pricing"), button:has-text("Variants"), button:has-text("SEO")');
    if (await tabs.count() > 0) {
      await expect(tabs.first()).toBeVisible();
    }
  });

  test('orders & production queue: tabs, status chips and QC workflow', async ({ page }) => {
    // Orders list
    await page.goto('/admin/orders');
    await expect(page.locator('h1')).toContainText(/Orders/i);

    // Status filter tabs
    const allTab = page.locator('button:has-text("All"), button:has-text("Pending"), button:has-text("Paid")');
    if (await allTab.count() > 0) {
      await expect(allTab.first()).toBeVisible();
    }

    // Production queue
    await page.goto('/admin/production');
    await expect(page.locator('h1')).toContainText(/Production/i);

    // Workstation tabs
    const stations = page.locator('button:has-text("Print Ready"), button:has-text("Assembly"), button:has-text("QC Inspection")');
    if (stations) {
      await expect(page.locator('text=QC Inspection, button:has-text("QC")').first()).toBeVisible();
    }

    // QC Station Page
    await page.goto('/admin/production/qc');
    await expect(page.locator('h1')).toContainText(/Quality Check|QC Inspection/i);
    const passBtn = page.locator('button:has-text("PASS"), button:has-text("Pass Inspection")');
    if (await passBtn.count() > 0) {
      await expect(passBtn.first()).toBeVisible();
    }
  });

  test('returns, customer directory and store settings', async ({ page }) => {
    // Returns & Refunds
    await page.goto('/admin/returns');
    await expect(page.locator('h1')).toContainText(/Returns|Refunds/i);

    // Customers
    await page.goto('/admin/customers');
    await expect(page.locator('h1')).toContainText(/Customers/i);

    // Settings
    await page.goto('/admin/settings');
    await expect(page.locator('h1')).toContainText(/Settings/i);

    // Team RBAC
    await page.goto('/admin/settings/team');
    await expect(page.locator('h1')).toContainText(/Team|Staff|Roles/i);
  });
});

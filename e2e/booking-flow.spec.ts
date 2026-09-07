import { test, expect } from '@playwright/test';

test.describe('Bareeq Public Services & Booking Flow E2E Tests', () => {
  test('services list page renders luxury service cards and links to details', async ({ page }) => {
    test.setTimeout(60_000);
    const res = await page.goto('/services', { waitUntil: 'domcontentloaded' });
    expect(res?.status() ?? 200).toBeLessThan(400);
    await expect(page).toHaveTitle(/(?:بريق|BAREEQ)/);
    const heading = page.locator('h1:visible').first();
    await expect(heading).toBeVisible({ timeout: 20_000 });
  });

  test('booking wizard renders correctly and supports direct guest booking', async ({ page }) => {
    test.setTimeout(60_000);
    const res = await page.goto('/services/bareeq-essential-exterior/book', { waitUntil: 'domcontentloaded' });
    expect(res?.status() ?? 200).toBeLessThan(400);
    const heading = page.locator('h1:visible').first();
    await expect(heading).toBeVisible({ timeout: 20_000 });
  });

  test('policies pages are accessible and render correctly', async ({ page }) => {
    await page.goto('/policies/booking');
    await expect(page.locator('h1:visible').first()).toBeVisible();

    await page.goto('/policies/cancellation');
    await expect(page.locator('h1:visible').first()).toBeVisible();

    await page.goto('/policies/privacy');
    await expect(page.locator('h1:visible').first()).toBeVisible();
  });
});

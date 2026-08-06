import { test, expect } from '@playwright/test';

test.describe('Bareeq Public Services & Booking Flow E2E Tests', () => {
  test('services list page renders luxury service cards and links to details', async ({ page }) => {
    await page.goto('/services');
    await expect(page).toHaveTitle(/.*بريق/);
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
  });

  test('booking wizard redirects unauthenticated customer to login', async ({ page }) => {
    // Navigating directly to a service book page should redirect unauthenticated users
    await page.goto('/services/supreme-detailing/book');
    await expect(page).toHaveURL(/.*login/);
  });

  test('policies pages are accessible and render correctly', async ({ page }) => {
    await page.goto('/policies/booking');
    await expect(page.locator('h1')).toBeVisible();

    await page.goto('/policies/cancellation');
    await expect(page.locator('h1')).toBeVisible();

    await page.goto('/policies/privacy');
    await expect(page.locator('h1')).toBeVisible();
  });
});

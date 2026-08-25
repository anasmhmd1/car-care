import { test, expect } from '@playwright/test';

test.describe('Bareeq RBAC & Auth Security E2E Tests', () => {
  test('unauthenticated user is redirected to login when visiting customer account pages', async ({ page }) => {
    await page.goto('/account');
    await expect(page).toHaveURL(/.*login/);
  });

  test('unauthenticated user is redirected to login when visiting owner command center', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/.*login/);
  });

  test('unauthenticated user is redirected to login when visiting operations dashboard', async ({ page }) => {
    await page.goto('/operations');
    await expect(page).toHaveURL(/.*login/);
  });

  test('unauthenticated user is redirected to login when visiting technician staff tasks', async ({ page }) => {
    await page.goto('/staff');
    await expect(page).toHaveURL(/.*login/);
  });

  test('unauthenticated user is redirected to login when visiting system admin panel', async ({ page }) => {
    await page.goto('/system-admin');
    await expect(page).toHaveURL(/.*login/);
  });

  test('public pages are accessible without authentication', async ({ page }) => {
    test.setTimeout(120_000);
    const publicRoutes = ['/', '/services', '/plans', '/areas', '/before-after', '/about', '/faq', '/contact'];
    for (const route of publicRoutes) {
      const res = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(res?.status() ?? 200, `${route} must be reachable`).toBeLessThan(400);
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 });
    }
  });
});

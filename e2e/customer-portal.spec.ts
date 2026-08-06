import { test, expect } from '@playwright/test';

test.describe('Bareeq Customer Portal Access & Routes E2E Tests', () => {
  test('all customer portal routes protect against unauthorized access', async ({ page }) => {
    const customerRoutes = [
      '/account/vehicles',
      '/account/addresses',
      '/account/subscriptions',
      '/account/invoices',
      '/account/support',
      '/account/profile',
      '/account/bookings',
    ];

    for (const route of customerRoutes) {
      await page.goto(route);
      await expect(page).toHaveURL(/.*login/);
    }
  });
});

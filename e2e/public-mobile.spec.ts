import { expect, test } from '@playwright/test';

// Keep this suite on the configured Chromium project. Spreading the iPhone
// descriptor also overrides `defaultBrowserType` to WebKit, which is not a
// requirement for this Chromium acceptance run and makes it depend on an
// unrelated browser binary. These settings still exercise the 390px mobile
// layout and touch viewport used by an iPhone-sized device.
test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

test.describe('Bareeq public mobile layout', () => {
  test('core public surfaces render without horizontal overflow', async ({ page }) => {
    const routes = [
      '/',
      '/services',
      '/plans',
      '/areas',
      '/before-after',
      '/about',
      '/faq',
      '/contact',
    ];

    for (const route of routes) {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), `${route} should remain publicly reachable`).toBeLessThan(400);
      await expect(page.locator('main')).toBeVisible();
      const layout = await page.evaluate(() => ({
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));
      expect(
        layout.documentWidth,
        `${route} should not introduce horizontal scrolling on mobile`,
      ).toBeLessThanOrEqual(layout.viewport + 1);
    }
  });

  test('a service detail preserves its media and booking call-to-action', async ({ page }) => {
    await page.goto('/services/bareeq-essential-exterior', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('img').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /احجز.*الآن/i })).toBeVisible();
  });
});

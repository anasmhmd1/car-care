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

    test.setTimeout(120_000);
    for (const route of routes) {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(response?.status() ?? 200, `${route} should remain publicly reachable`).toBeLessThan(400);
      await expect(page.locator('main')).toBeVisible({ timeout: 20_000 });
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

  test('services listing shows service cards with images and booking CTAs on mobile', async ({ page }) => {
    test.setTimeout(90_000);
    // /services was already visited in the previous test so the route is warm
    const res = await page.goto('/services', { waitUntil: 'domcontentloaded' });
    expect(res?.status() ?? 200, '/services must be reachable on mobile').toBeLessThan(400);

    await expect(page.locator('main')).toBeVisible({ timeout: 30_000 });
    // Service cards should contain images on mobile
    await expect(page.locator('main img').first()).toBeVisible({ timeout: 20_000 });
    // At least one booking CTA button should be visible
    await expect(page.getByRole('link', { name: /احجز/i }).first()).toBeVisible({ timeout: 20_000 });
    // Verify no horizontal scroll (mobile-specific concern)
    const layout = await page.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.documentWidth, 'services page must not overflow on mobile').toBeLessThanOrEqual(layout.viewport + 1);
  });
});

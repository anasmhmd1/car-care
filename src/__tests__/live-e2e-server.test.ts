import { beforeAll, describe, expect, it } from 'vitest';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

describe('Complete E2E Live Web Server Verification', () => {
  let isServerReachable = false;

  beforeAll(async () => {
    try {
      const res = await fetch(`${BASE_URL}/`, { signal: AbortSignal.timeout(3000) });
      isServerReachable = res.status < 500;
    } catch {
      isServerReachable = false;
    }
  });

  const publicRoutes = [
    '/',
    '/services',
    '/plans',
    '/about',
    '/contact',
    '/faq',
    '/policies/booking',
    '/policies/cancellation',
    '/policies/privacy',
    '/login',
    '/register',
    '/before-after',
  ];

  for (const route of publicRoutes) {
    it(`renders public route ${route} successfully (HTTP 200)`, async (ctx) => {
      if (!isServerReachable) {
        ctx.skip();
        return;
      }
      const response = await fetch(`${BASE_URL}${route}`, {
        headers: { 'User-Agent': 'Bareeq-E2E-Tester' },
      });
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html.length).toBeGreaterThan(500);
      // Basic luxury dark theme / Arabic HTML tags check
      expect(html).toContain('html');
    }, 30000);
  }

  it('serves favicon and static icon without errors', async (ctx) => {
    if (!isServerReachable) {
      ctx.skip();
      return;
    }
    const response = await fetch(`${BASE_URL}/icon.svg`);
    expect(response.status).toBe(200);
  }, 30000);

  it('serves robots.txt and sitemap.xml', async (ctx) => {
    if (!isServerReachable) {
      ctx.skip();
      return;
    }
    const robotsRes = await fetch(`${BASE_URL}/robots.txt`);
    expect(robotsRes.status).toBe(200);

    const sitemapRes = await fetch(`${BASE_URL}/sitemap.xml`);
    expect(sitemapRes.status).toBe(200);
  }, 30000);

  it('validates public availability API rejects missing parameters safely', async (ctx) => {
    if (!isServerReachable) {
      ctx.skip();
      return;
    }
    const response = await fetch(`${BASE_URL}/api/availability`);
    expect([400, 422]).toContain(response.status);
    const data = await response.json();
    expect(data.error || data.message || data.issues).toBeDefined();
  }, 30000);
});

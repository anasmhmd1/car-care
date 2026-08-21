import { MetadataRoute } from 'next';
import { db } from '@/lib/db';
import { siteUrl } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const routes = [
    '',
    '/services',
    '/plans',
    '/before-after',
    '/faq',
    '/about',
    '/contact',
    '/policies/booking',
    '/policies/cancellation',
    '/policies/privacy',
  ].map((route) => ({
    url: new URL(route || '/', siteUrl).toString(),
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: route === '' ? 1.0 : 0.8,
  }));

  try {
    const services = await db.service.findMany({
      where: { active: true },
      select: { slug: true, updatedAt: true },
    });

    const serviceRoutes = services.map((service) => ({
      url: new URL(`/services/${service.slug}`, siteUrl).toString(),
      lastModified: service.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.9,
    }));

    return [...routes, ...serviceRoutes];
  } catch {
    return routes;
  }
}

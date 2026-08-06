import type { Metadata } from 'next';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { faqListSchema, readHomepageContent } from '@/lib/homepage-content';
import SiteContentManager from './SiteContentManager';

export const metadata: Metadata = {
  title: 'محتوى الموقع | إدارة بريق',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminSiteContentPage() {
  await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);
  const brand = await db.brandSettings.findFirst({ select: { homepageContent: true, faqs: true } });
  const parsedFaqs = faqListSchema.safeParse(brand?.faqs);
  const faqs = parsedFaqs.success ? parsedFaqs.data : [];
  return <SiteContentManager initialContent={readHomepageContent(brand?.homepageContent)} initialFaqs={faqs} />;
}

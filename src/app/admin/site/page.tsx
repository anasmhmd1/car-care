import type { Metadata } from 'next';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { faqListSchema, readHomepageContent } from '@/lib/homepage-content';
import { readServiceCollections } from '@/lib/service-collections';
import { readGalleryItems } from '@/lib/gallery-items';
import { readPoliciesContent } from '@/lib/policies-content';
import { readSocialLinks } from '@/lib/social-links';
import AdminSiteClient from './AdminSiteClient';

export const metadata: Metadata = {
  title: 'إدارة محتوى الموقع والتغطية والسياسات | إدارة بريق',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminSiteContentPage() {
  await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);

  const [brand, services, zones, defaultBranch] = await Promise.all([
    db.brandSettings.findFirst({ select: { homepageContent: true, faqs: true } }),
    db.service.findMany({
      where: { active: true },
      select: {
        id: true,
        nameAr: true,
        slug: true,
        basePrice: true,
        durationMinutes: true,
      },
      orderBy: { basePrice: 'asc' },
    }),
    db.coverageZone.findMany({
      include: {
        areas: {
          orderBy: [{ priority: 'asc' }, { compound: 'asc' }],
          select: {
            id: true,
            compound: true,
            district: true,
            active: true,
            priority: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    }),
    db.branch.findFirst({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        nameAr: true,
        phone: true,
        whatsapp: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const parsedFaqs = faqListSchema.safeParse(brand?.faqs);
  const faqs = parsedFaqs.success ? parsedFaqs.data : [];
  const collections = readServiceCollections(brand?.homepageContent);
  const content = readHomepageContent(brand?.homepageContent);
  const gallery = readGalleryItems(brand?.homepageContent);
  const policies = readPoliciesContent(brand?.homepageContent);
  const socialLinks = readSocialLinks(brand?.homepageContent);

  return (
    <AdminSiteClient
      initialCollections={collections}
      availableServices={services}
      initialContent={content}
      initialFaqs={faqs}
      initialZones={zones}
      initialGallery={gallery}
      initialPolicies={policies}
      initialSocialLinks={socialLinks}
      activeBranch={defaultBranch}
      defaultBranchId={defaultBranch?.id || ''}
    />
  );
}

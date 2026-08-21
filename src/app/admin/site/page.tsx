import type { Metadata } from 'next';
import { ChecklistStage, UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { expireActiveSubscriptions } from '@/lib/engine/subscription-expiration';
import { faqListSchema, readHomepageContent } from '@/lib/homepage-content';
import { readServiceCollections } from '@/lib/service-collections';
import { readGalleryItems } from '@/lib/gallery-items';
import { readPoliciesContent } from '@/lib/policies-content';
import { readSocialLinks } from '@/lib/social-links';
import AdminSiteClient from './AdminSiteClient';
import { type BranchOverrideDto, type CatalogMaterialDto, type SiteServiceDto } from './ServicesManager';
import {
  type SubscriptionPlanAdminItem,
  type SubscriptionPlanBranchOption,
  type SubscriptionPlanServiceOption,
} from '../subscriptions/SubscriptionPlanManager';

export const metadata: Metadata = {
  title: 'إدارة محتوى الموقع والتغطية والسياسات | إدارة بريق',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

interface AdminSiteContentPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminSiteContentPage({ searchParams }: AdminSiteContentPageProps) {
  const [sp] = await Promise.all([
    searchParams ? searchParams : Promise.resolve<Record<string, string | string[] | undefined>>({}),
    requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]),
  ]);

  await expireActiveSubscriptions();

  const tabParam = typeof sp.tab === 'string' ? sp.tab : undefined;
  const serviceIdParam = typeof sp.serviceId === 'string' ? sp.serviceId : undefined;
  const isNewParam = sp.new === '1' || sp.new === 'true';

  const [brand, servicesRaw, zones, branchesRaw, materialsRaw, plansRaw] = await Promise.all([
    db.brandSettings.findFirst({ select: { homepageContent: true, faqs: true } }),
    db.service.findMany({
      orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
      include: {
        branchServices: { orderBy: { branchId: 'asc' } },
        checklistTemplates: {
          where: { stage: ChecklistStage.SERVICE_EXECUTION },
          include: { items: { orderBy: { displayOrder: 'asc' } } },
        },
        materialRequirements: {
          orderBy: { materialId: 'asc' },
          select: {
            materialId: true,
            quantity: true,
            required: true,
            notes: true,
          },
        },
      },
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
    db.branch.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        nameAr: true,
        phone: true,
        whatsapp: true,
        status: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    db.material.findMany({
      orderBy: [{ active: 'desc' }, { nameAr: 'asc' }],
      select: { id: true, nameAr: true, unit: true, active: true },
    }),
    db.subscriptionPlan.findMany({
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        nameAr: true,
        descriptionAr: true,
        price: true,
        validityDays: true,
        visitCount: true,
        allowedVehicleCount: true,
        freezeAllowed: true,
        maxFreezeDays: true,
        rules: true,
        active: true,
        services: { select: { serviceId: true, visitQuota: true } },
        branches: { select: { branchId: true } },
        _count: { select: { subscriptions: true } },
      },
    }),
  ]);

  const parsedFaqs = faqListSchema.safeParse(brand?.faqs);
  const faqs = parsedFaqs.success ? parsedFaqs.data : [];
  const collections = readServiceCollections(brand?.homepageContent);
  const content = readHomepageContent(brand?.homepageContent);
  const gallery = readGalleryItems(brand?.homepageContent);
  const policies = readPoliciesContent(brand?.homepageContent);
  const socialLinks = readSocialLinks(brand?.homepageContent);

  const fullServices: SiteServiceDto[] = servicesRaw.map((service) => ({
    id: service.id,
    cancellationPolicyId: service.cancellationPolicyId,
    nameAr: service.nameAr,
    nameEn: service.nameEn,
    slug: service.slug,
    shortDescriptionAr: service.shortDescriptionAr,
    fullDescriptionAr: service.fullDescriptionAr,
    coverImage: service.coverImage,
    galleryImages: stringArray(service.galleryImages),
    includedItems: stringArray(service.includedItems),
    excludedItems: stringArray(service.excludedItems),
    benefits: stringArray(service.benefits),
    preparationInstructions: service.preparationInstructions,
    basePrice: service.basePrice,
    priceType: service.priceType,
    durationMinutes: service.durationMinutes,
    slotCount: service.slotCount,
    requiredTeamSize: service.requiredTeamSize,
    requiresDeposit: service.requiresDeposit,
    depositType: service.depositType,
    depositValue: service.depositValue,
    requiresFullPrepayment: service.requiresFullPrepayment,
    active: service.active,
    bookableOnline: service.bookableOnline,
    subscriptionEligible: service.subscriptionEligible,
    minimumBeforePhotos: service.minimumBeforePhotos,
    minimumAfterPhotos: service.minimumAfterPhotos,
    branchOverrides: service.branchServices.map((override): BranchOverrideDto => ({
      branchId: override.branchId,
      active: override.active,
      bookableOnline: override.bookableOnline,
      priceOverride: override.priceOverride,
      durationOverrideMinutes: override.durationOverrideMinutes,
    })),
    materialRequirements: service.materialRequirements.map((requirement) => ({
      materialId: requirement.materialId,
      quantity: requirement.quantity,
      required: requirement.required,
      notes: requirement.notes,
    })),
    checklistItems: (service.checklistTemplates[0]?.items ?? []).map((item) => ({
      id: item.id,
      labelAr: item.labelAr,
      descriptionAr: item.descriptionAr,
      required: item.required,
      requiresPhoto: item.requiresPhoto,
      requiresNote: item.requiresNote,
      active: item.active,
    })),
  }));

  const availableServices = servicesRaw
    .filter((s) => s.active)
    .map((s) => ({
      id: s.id,
      nameAr: s.nameAr,
      slug: s.slug,
      basePrice: s.basePrice,
      durationMinutes: s.durationMinutes,
    }));

  const materials: CatalogMaterialDto[] = materialsRaw.map((material) => ({
    id: material.id,
    nameAr: material.nameAr,
    unit: material.unit,
    active: material.active,
  }));

  const plans: SubscriptionPlanAdminItem[] = plansRaw.map((plan) => ({
    id: plan.id,
    nameAr: plan.nameAr,
    descriptionAr: plan.descriptionAr,
    price: plan.price,
    validityDays: plan.validityDays,
    visitCount: plan.visitCount,
    allowedVehicleCount: plan.allowedVehicleCount,
    freezeAllowed: plan.freezeAllowed,
    maxFreezeDays: plan.maxFreezeDays,
    rules: plan.rules === null ? '{}' : JSON.stringify(plan.rules, null, 2),
    active: plan.active,
    serviceIds: plan.services.map(({ serviceId }) => serviceId),
    serviceQuotas: plan.services.reduce<Record<string, number | null>>((quotas, service) => {
      quotas[service.serviceId] = service.visitQuota;
      return quotas;
    }, {}),
    branchIds: plan.branches.map(({ branchId }) => branchId),
    subscriptionCount: plan._count.subscriptions,
  }));

  const subscriptionServices: SubscriptionPlanServiceOption[] = servicesRaw.map((s) => ({
    id: s.id,
    nameAr: s.nameAr,
    active: s.active,
    subscriptionEligible: s.subscriptionEligible,
  }));

  const subscriptionBranches: SubscriptionPlanBranchOption[] = branchesRaw.map((b) => ({
    id: b.id,
    nameAr: b.nameAr,
    status: b.status as 'ACTIVE' | 'PAUSED' | 'DISABLED',
  }));

  return (
    <AdminSiteClient
      initialCollections={collections}
      availableServices={availableServices}
      fullServices={fullServices}
      materials={materials}
      plans={plans}
      subscriptionServices={subscriptionServices}
      subscriptionBranches={subscriptionBranches}
      initialContent={content}
      initialFaqs={faqs}
      initialZones={zones}
      initialGallery={gallery}
      initialPolicies={policies}
      initialSocialLinks={socialLinks}
      branches={branchesRaw}
      activeBranch={branchesRaw[0] ?? null}
      defaultBranchId={branchesRaw[0]?.id || ''}
      initialTab={tabParam}
      initialServiceId={serviceIdParam}
      isNewService={isNewParam}
    />
  );
}

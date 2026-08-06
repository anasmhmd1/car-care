import type { Metadata } from 'next';
import { BranchStatus, UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import CatalogManager, {
  type BranchOverrideDto,
  type CatalogMaterialDto,
  type CatalogServiceDto,
  type VehicleSizeCode,
} from './CatalogManager';

export const metadata: Metadata = {
  title: 'كتالوج الخدمات | إدارة بريق',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export default async function CatalogPage() {
  await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);
  const [servicesRaw, addonsRaw, branches, cancellationPolicies, materials] = await Promise.all([
    db.service.findMany({
      orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
      include: {
        variants: { orderBy: { vehicleSize: 'asc' } },
        addonLinks: { select: { addonId: true } },
        branchServices: { orderBy: { branchId: 'asc' } },
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
    db.serviceAddon.findMany({
      orderBy: [{ active: 'desc' }, { nameAr: 'asc' }],
      include: { _count: { select: { serviceLinks: true } } },
    }),
    db.branch.findMany({
      where: { status: BranchStatus.ACTIVE },
      orderBy: { nameAr: 'asc' },
      select: { id: true, nameAr: true },
    }),
    db.cancellationPolicy.findMany({
      orderBy: [{ isDefault: 'desc' }, { active: 'desc' }, { nameAr: 'asc' }],
      include: { _count: { select: { services: true } } },
    }),
    db.material.findMany({
      orderBy: [{ active: 'desc' }, { nameAr: 'asc' }],
      select: { id: true, nameAr: true, unit: true, active: true },
    }),
  ]);

  const services: CatalogServiceDto[] = servicesRaw.map((service) => ({
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
    variants: service.variants.map((variant) => ({
      vehicleSize: variant.vehicleSize as VehicleSizeCode,
      price: variant.price,
      durationMinutes: variant.durationMinutes,
      slotCount: variant.slotCount,
      depositValue: variant.depositValue,
    })),
    addonIds: service.addonLinks.map(({ addonId }) => addonId),
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
  }));

  return (
    <CatalogManager
      services={services}
      addons={addonsRaw.map((addon) => ({
        id: addon.id,
        nameAr: addon.nameAr,
        nameEn: addon.nameEn,
        price: addon.price,
        durationMinutes: addon.durationMinutes,
        slotCount: addon.slotCount,
        active: addon.active,
        linkedServices: addon._count.serviceLinks,
      }))}
      branches={branches}
      cancellationPolicies={cancellationPolicies.map((policy) => ({
        id: policy.id,
        code: policy.code,
        nameAr: policy.nameAr,
        version: policy.version,
        noticeHours: policy.noticeHours,
        allowsCancellation: policy.allowsCancellation,
        allowsRescheduling: policy.allowsRescheduling,
        allowsLateRequests: policy.allowsLateRequests,
        policyTextAr: policy.policyTextAr,
        active: policy.active,
        isDefault: policy.isDefault,
        linkedServices: policy._count.services,
      }))}
      materials={materials.map((material): CatalogMaterialDto => ({
        id: material.id,
        nameAr: material.nameAr,
        unit: material.unit,
        active: material.active,
      }))}
    />
  );
}

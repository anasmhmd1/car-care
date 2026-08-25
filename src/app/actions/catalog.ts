'use server';

import { ChecklistStage, Prisma, UserRole, VehicleSize } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  canUseServiceMaterialRequirement,
  catalogMaterialRequirementsSchema,
  parseCatalogMaterialRequirementsPayload,
} from '@/lib/validations/catalog-materials';
import { databaseIdSchema } from '@/lib/validations/database-id';

const safeMediaUrl = z.string().trim().max(500).refine(
  (value) => value.startsWith('/api/catalog-media/') || value.startsWith('/images/') || /^https:\/\//i.test(value),
  'رابط الصورة يجب أن يكون ملفًا مرفوعًا أو رابط HTTPS آمنًا.',
);

const variantSchema = z.object({
  vehicleSize: z.nativeEnum(VehicleSize),
  price: z.coerce.number().int().min(0).max(1_000_000),
  durationMinutes: z.coerce.number().int().min(15).max(1_440),
  slotCount: z.coerce.number().int().min(1).max(48),
  depositValue: z.coerce.number().int().min(0).max(1_000_000).nullable().optional(),
});

const branchOverrideSchema = z.object({
  branchId: databaseIdSchema,
  active: z.boolean(),
  bookableOnline: z.boolean(),
  priceOverride: z.coerce.number().int().min(0).max(1_000_000).nullable().optional(),
  durationOverrideMinutes: z.coerce.number().int().min(15).max(1_440).nullable().optional(),
});

const cancellationPolicySchema = z.object({
  policyId: databaseIdSchema.optional(),
  code: z.string().trim().toLowerCase().regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'كود السياسة يقبل حروفًا إنجليزية صغيرة وأرقامًا وشرطات فقط.',
  ),
  nameAr: z.string().trim().min(2).max(120),
  version: z.string().trim().min(1).max(50),
  noticeHours: z.coerce.number().int().min(0).max(720),
  allowsCancellation: z.boolean(),
  allowsRescheduling: z.boolean(),
  allowsLateRequests: z.boolean(),
  policyTextAr: z.string().trim().min(20).max(10_000),
  active: z.boolean(),
  isDefault: z.boolean(),
}).superRefine((value, context) => {
  if (value.isDefault && !value.active) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['active'],
      message: 'السياسة الافتراضية يجب أن تكون نشطة.',
    });
  }
});

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const checklistItemInputSchema = z.object({
  id: databaseIdSchema.optional(),
  labelAr: z.string().trim().min(2).max(200),
  descriptionAr: z.string().trim().max(500).optional().nullable(),
  required: z.boolean().default(true),
  requiresPhoto: z.boolean().default(false),
  requiresNote: z.boolean().default(false),
  active: z.boolean().default(true),
});

const serviceProductSchema = z.object({
  serviceId: databaseIdSchema.optional(),
  cancellationPolicyId: databaseIdSchema.optional(),
  nameAr: z.string().trim().min(2).max(120),
  nameEn: z.string().trim().max(120).optional(),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'الرابط المختصر يقبل حروفًا إنجليزية صغيرة وأرقامًا وشرطات فقط.'),
  shortDescriptionAr: z.string().trim().min(5).max(300),
  fullDescriptionAr: z.string().trim().min(10).max(5_000),
  coverImage: safeMediaUrl,
  galleryImages: z.array(safeMediaUrl).max(10),
  includedItems: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  excludedItems: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  benefits: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  preparationInstructions: z.string().trim().max(2_000).optional(),
  basePrice: z.coerce.number().int().min(0).max(1_000_000),
  priceType: z.enum(['FIXED', 'STARTS_FROM', 'VARIANT_BASED']).default('FIXED'),
  durationMinutes: z.coerce.number().int().min(15).max(1_440).optional(),
  slotCount: z.coerce.number().int().min(1).max(48),
  requiredTeamSize: z.coerce.number().int().min(1).max(20),
  requiresDeposit: z.boolean(),
  depositType: z.enum(['FIXED', 'PERCENTAGE']),
  depositValue: z.coerce.number().int().min(0).max(1_000_000),
  requiresFullPrepayment: z.boolean(),
  active: z.boolean(),
  bookableOnline: z.boolean(),
  subscriptionEligible: z.boolean(),
  minimumBeforePhotos: z.coerce.number().int().min(0).max(20),
  minimumAfterPhotos: z.coerce.number().int().min(0).max(20),
  variants: z.array(variantSchema).max(Object.values(VehicleSize).length).default([]),
  addonIds: z.array(databaseIdSchema).max(50).default([]),
  branchOverrides: z.array(branchOverrideSchema).max(100).default([]),
  materialRequirements: catalogMaterialRequirementsSchema,
  checklistItems: z.array(checklistItemInputSchema).default([]),
}).superRefine((value, context) => {
  if (value.depositType === 'PERCENTAGE' && value.depositValue > 100) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['depositValue'], message: 'نسبة العربون لا تتجاوز 100%.' });
  }
  const branchIds = value.branchOverrides.map((override) => override.branchId);
  if (new Set(branchIds).size !== branchIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['branchOverrides'], message: 'لا يمكن تكرار إعداد الفرع.' });
  }
});

const addonSchema = z.object({
  addonId: databaseIdSchema.optional(),
  nameAr: z.string().trim().min(2).max(120),
  nameEn: z.string().trim().max(120).optional(),
  price: z.coerce.number().int().min(0).max(1_000_000),
  durationMinutes: z.coerce.number().int().min(0).max(1_440),
  slotCount: z.coerce.number().int().min(0).max(48),
  active: z.boolean(),
});

function jsonArray(value: FormDataEntryValue | null): unknown[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function stringList(value: FormDataEntryValue | null): string[] {
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed || trimmed === '[]') return [];
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return [...new Set(parsed.map((item) => String(item).trim()).filter(Boolean))];
    }
  } catch {
    // not JSON, fallback to newline separated
  }
  return [...new Set(trimmed.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean))];
}

function bool(value: FormDataEntryValue | null, fallback = false) {
  if (value === null) return fallback;
  return value === 'true' || value === 'on' || value === '1';
}

function catalogError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return 'الرابط المختصر مستخدم لخدمة أخرى.';
    if (error.code === 'P2034') return 'تغير الكتالوج أثناء الحفظ؛ أعد المحاولة.';
  }
  console.error('Catalog action failed:', error);
  return 'تعذر حفظ الكتالوج. تحقق من البيانات وحاول مرة أخرى.';
}

function revalidateCatalog() {
  revalidatePath('/admin');
  revalidatePath('/admin/catalog');
  revalidatePath('/admin/site');
  revalidatePath('/services');
  revalidatePath('/plans');
  revalidatePath('/admin/setup');
  revalidatePath('/policies/cancellation');
  revalidatePath('/');
}

export async function saveServiceProductAction(formData: FormData) {
  const actor = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);
  const materialRequirementsPayload = parseCatalogMaterialRequirementsPayload(
    formData.get('materialRequirements'),
  );
  if (!materialRequirementsPayload.success) return { error: materialRequirementsPayload.error };

  const rawNameEn = (formData.get('nameEn') as string | null)?.trim() || '';
  const rawSlug = (formData.get('slug') as string | null)?.trim() || '';
  const resolvedSlug = rawSlug ? slugify(rawSlug) : (rawNameEn ? slugify(rawNameEn) : `service-${Date.now()}`);

  const parsed = serviceProductSchema.safeParse({
    serviceId: formData.get('serviceId') || undefined,
    cancellationPolicyId: formData.get('cancellationPolicyId'),
    nameAr: formData.get('nameAr'),
    nameEn: rawNameEn || undefined,
    slug: resolvedSlug,
    shortDescriptionAr: formData.get('shortDescriptionAr'),
    fullDescriptionAr: formData.get('fullDescriptionAr'),
    coverImage: formData.get('coverImage'),
    galleryImages: jsonArray(formData.get('galleryImages')),
    includedItems: stringList(formData.get('includedItems')),
    excludedItems: stringList(formData.get('excludedItems')),
    benefits: stringList(formData.get('benefits')),
    preparationInstructions: formData.get('preparationInstructions') || undefined,
    basePrice: formData.get('basePrice'),
    priceType: 'FIXED',
    durationMinutes: formData.get('durationMinutes'),
    slotCount: formData.get('slotCount'),
    requiredTeamSize: formData.get('requiredTeamSize'),
    requiresDeposit: bool(formData.get('requiresDeposit')),
    depositType: formData.get('depositType'),
    depositValue: formData.get('depositValue'),
    requiresFullPrepayment: bool(formData.get('requiresFullPrepayment')),
    active: bool(formData.get('active')),
    bookableOnline: bool(formData.get('bookableOnline')),
    subscriptionEligible: bool(formData.get('subscriptionEligible')),
    minimumBeforePhotos: formData.get('minimumBeforePhotos'),
    minimumAfterPhotos: formData.get('minimumAfterPhotos'),
    variants: jsonArray(formData.get('variants')),
    addonIds: jsonArray(formData.get('addonIds')),
    branchOverrides: jsonArray(formData.get('branchOverrides')),
    materialRequirements: materialRequirementsPayload.data,
    checklistItems: jsonArray(formData.get('checklistItems')),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات الخدمة غير مكتملة.' };
  }

  try {
    const result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`catalog:${parsed.data.serviceId ?? parsed.data.slug}`}))`;
      const requestedMaterialIds = parsed.data.materialRequirements.map((requirement) => requirement.materialId);
      const [before, cancellationPolicy, addonCount, branchCount, materials] = await Promise.all([
        parsed.data.serviceId
          ? tx.service.findUnique({
              where: { id: parsed.data.serviceId },
              select: {
                id: true,
                slug: true,
                nameAr: true,
                active: true,
                cancellationPolicyId: true,
                materialRequirements: {
                  select: {
                    materialId: true,
                    quantity: true,
                    required: true,
                    notes: true,
                  },
                },
              },
            })
          : Promise.resolve(null),
        tx.cancellationPolicy.findFirst({
          where: parsed.data.cancellationPolicyId
            ? { id: parsed.data.cancellationPolicyId, active: true }
            : { active: true },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
          select: { id: true },
        }),
        tx.serviceAddon.count({ where: { id: { in: parsed.data.addonIds } } }),
        tx.branch.count({ where: { id: { in: parsed.data.branchOverrides.map((override) => override.branchId) } } }),
        requestedMaterialIds.length
          ? tx.material.findMany({
              where: { id: { in: requestedMaterialIds } },
              select: { id: true, active: true },
            })
          : Promise.resolve([]),
      ]);
      let resolvedPolicyId = cancellationPolicy?.id;
      if (!resolvedPolicyId) {
        const fallbackPolicy = await tx.cancellationPolicy.findFirst({
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
          select: { id: true },
        }) || await tx.cancellationPolicy.create({
          data: {
            code: 'DEFAULT',
            nameAr: 'سياسة الإلغاء القياسية',
            version: '1.0',
            noticeHours: 24,
            allowsCancellation: true,
            policyTextAr: 'يمكنك إلغاء أو تعديل الحجز قبل الموعد بـ 24 ساعة على الأقل.',
            active: true,
            isDefault: true,
          },
          select: { id: true },
        });
        resolvedPolicyId = fallbackPolicy.id;
      }

      if (addonCount !== parsed.data.addonIds.length) throw new Error('INVALID_ADDONS');
      if (branchCount !== parsed.data.branchOverrides.length) throw new Error('INVALID_BRANCHES');
      if (materials.length !== requestedMaterialIds.length) throw new Error('INVALID_MATERIALS');

      const existingMaterialIds = new Set(before?.materialRequirements.map((requirement) => requirement.materialId) ?? []);
      if (materials.some((material) => !canUseServiceMaterialRequirement(material, existingMaterialIds))) {
        throw new Error('INACTIVE_MATERIAL');
      }

      const serviceData = {
        cancellationPolicyId: resolvedPolicyId,
        nameAr: parsed.data.nameAr,
        nameEn: parsed.data.nameEn || null,
        slug: parsed.data.slug,
        shortDescriptionAr: parsed.data.shortDescriptionAr,
        fullDescriptionAr: parsed.data.fullDescriptionAr,
        coverImage: parsed.data.coverImage,
        galleryImages: parsed.data.galleryImages,
        includedItems: parsed.data.includedItems,
        excludedItems: parsed.data.excludedItems,
        benefits: parsed.data.benefits,
        preparationInstructions: parsed.data.preparationInstructions || null,
        basePrice: parsed.data.basePrice,
        priceType: parsed.data.priceType,
        durationMinutes: parsed.data.slotCount * 60,
        slotCount: parsed.data.slotCount,
        requiredTeamSize: parsed.data.requiredTeamSize,
        requiresDeposit: parsed.data.requiresDeposit,
        depositType: parsed.data.depositType,
        depositValue: parsed.data.depositValue,
        requiresFullPrepayment: parsed.data.requiresFullPrepayment,
        active: parsed.data.active,
        bookableOnline: parsed.data.bookableOnline,
        subscriptionEligible: parsed.data.subscriptionEligible,
        minimumBeforePhotos: parsed.data.minimumBeforePhotos,
        minimumAfterPhotos: parsed.data.minimumAfterPhotos,
      } satisfies Prisma.ServiceUncheckedCreateInput;

      const service = parsed.data.serviceId
        ? await tx.service.update({ where: { id: parsed.data.serviceId }, data: serviceData })
        : await tx.service.create({ data: serviceData });

      await Promise.all([
        tx.serviceVariant.deleteMany({ where: { serviceId: service.id } }),
        tx.serviceAddonLink.deleteMany({ where: { serviceId: service.id } }),
        tx.branchService.deleteMany({ where: { serviceId: service.id } }),
        tx.serviceMaterialRequirement.deleteMany({ where: { serviceId: service.id } }),
      ]);
      if (parsed.data.variants.length) {
        await tx.serviceVariant.createMany({
          data: parsed.data.variants.map((variant) => ({ ...variant, depositValue: variant.depositValue ?? null, serviceId: service.id })),
        });
      }
      if (parsed.data.addonIds.length) {
        await tx.serviceAddonLink.createMany({ data: parsed.data.addonIds.map((addonId) => ({ serviceId: service.id, addonId })) });
      }
      if (parsed.data.branchOverrides.length) {
        await tx.branchService.createMany({
          data: parsed.data.branchOverrides.map((override) => ({
            serviceId: service.id,
            branchId: override.branchId,
            active: override.active,
            bookableOnline: override.bookableOnline,
            priceOverride: override.priceOverride ?? null,
            durationOverrideMinutes: override.durationOverrideMinutes ?? null,
          })),
        });
      }
      if (parsed.data.materialRequirements.length) {
        await tx.serviceMaterialRequirement.createMany({
          data: parsed.data.materialRequirements.map((requirement) => ({
            serviceId: service.id,
            materialId: requirement.materialId,
            quantity: requirement.quantity,
            required: requirement.required,
            notes: requirement.notes || null,
          })),
        });
      }

      if (parsed.data.checklistItems.length > 0) {
        const template = await tx.checklistTemplate.upsert({
          where: {
            serviceId_stage: {
              serviceId: service.id,
              stage: ChecklistStage.SERVICE_EXECUTION,
            },
          },
          update: {
            name: `قائمة تنفيذ ${service.nameAr}`,
          },
          create: {
            serviceId: service.id,
            stage: ChecklistStage.SERVICE_EXECUTION,
            name: `قائمة تنفيذ ${service.nameAr}`,
          },
        });

        const suppliedItemIds = parsed.data.checklistItems.flatMap((item) => (item.id ? [item.id] : []));
        await tx.checklistTemplateItem.deleteMany({
          where: {
            templateId: template.id,
            ...(suppliedItemIds.length ? { id: { notIn: suppliedItemIds } } : {}),
          },
        });

        for (let i = 0; i < parsed.data.checklistItems.length; i++) {
          const item = parsed.data.checklistItems[i];
          if (!item.labelAr?.trim()) continue;
          const data = {
            labelAr: item.labelAr.trim(),
            descriptionAr: item.descriptionAr?.trim() || null,
            required: item.required ?? true,
            requiresPhoto: item.requiresPhoto ?? false,
            requiresNote: item.requiresNote ?? false,
            displayOrder: i + 1,
            active: item.active ?? true,
          };
          if (item.id) {
            await tx.checklistTemplateItem.update({ where: { id: item.id }, data });
          } else {
            await tx.checklistTemplateItem.create({
              data: { templateId: template.id, ...data },
            });
          }
        }
      }
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: before ? 'SERVICE_PRODUCT_UPDATED' : 'SERVICE_PRODUCT_CREATED',
          entityType: 'Service',
          entityId: service.id,
          beforeJson: before ?? undefined,
          afterJson: {
            nameAr: service.nameAr,
            slug: service.slug,
            active: service.active,
            cancellationPolicyId: service.cancellationPolicyId,
            variantCount: parsed.data.variants.length,
            addonCount: parsed.data.addonIds.length,
            branchOverrideCount: parsed.data.branchOverrides.length,
            materialRequirementCount: parsed.data.materialRequirements.length,
            materialRequirements: parsed.data.materialRequirements,
          },
        },
      });
      return service;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 20_000 });

    revalidateCatalog();
    return { success: true, serviceId: result.id, message: 'تم حفظ الخدمة كمنتج متكامل.' };
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_MATERIALS') return { error: 'إحدى المواد المحددة غير موجودة.' };
    if (error instanceof Error && error.message === 'INACTIVE_MATERIAL') return { error: 'لا يمكن إضافة مادة موقوفة إلى الخدمة.' };
    if (error instanceof Error && error.message === 'SERVICE_NOT_FOUND') return { error: 'الخدمة غير موجودة.' };
    if (error instanceof Error && error.message === 'INVALID_CANCELLATION_POLICY') return { error: 'سياسة الإلغاء المحددة غير موجودة أو غير نشطة.' };
    if (error instanceof Error && error.message === 'INVALID_ADDONS') return { error: 'إحدى الإضافات المحددة غير موجودة.' };
    if (error instanceof Error && error.message === 'INVALID_BRANCHES') return { error: 'أحد إعدادات الفروع غير صالح.' };
    return { error: catalogError(error) };
  }
}

export async function saveCancellationPolicyAction(formData: FormData) {
  const actor = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);
  const parsed = cancellationPolicySchema.safeParse({
    policyId: formData.get('policyId') || undefined,
    code: formData.get('code'),
    nameAr: formData.get('nameAr'),
    version: formData.get('version'),
    noticeHours: formData.get('noticeHours'),
    allowsCancellation: bool(formData.get('allowsCancellation')),
    allowsRescheduling: bool(formData.get('allowsRescheduling')),
    allowsLateRequests: bool(formData.get('allowsLateRequests')),
    policyTextAr: formData.get('policyTextAr'),
    active: bool(formData.get('active')),
    isDefault: bool(formData.get('isDefault')),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات سياسة الإلغاء غير مكتملة.' };
  }

  try {
    const policy = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('catalog:cancellation-policy-default'))`;
      const existing = parsed.data.policyId
        ? await tx.cancellationPolicy.findUnique({ where: { id: parsed.data.policyId } })
        : null;
      if (parsed.data.policyId && !existing) throw new Error('POLICY_NOT_FOUND');

      if (existing?.active && !parsed.data.active) {
        const activeServiceCount = await tx.service.count({
          where: { cancellationPolicyId: existing.id, active: true },
        });
        if (activeServiceCount > 0) throw new Error('POLICY_IN_USE');
      }

      if (existing?.isDefault && !parsed.data.isDefault) {
        const replacement = await tx.cancellationPolicy.findFirst({
          where: { id: { not: existing.id }, active: true, isDefault: true },
          select: { id: true },
        });
        if (!replacement) throw new Error('DEFAULT_POLICY_REQUIRED');
      }

      if (parsed.data.isDefault) {
        await tx.cancellationPolicy.updateMany({
          where: parsed.data.policyId ? { id: { not: parsed.data.policyId }, isDefault: true } : { isDefault: true },
          data: { isDefault: false },
        });
      }

      const data = {
        code: parsed.data.code,
        nameAr: parsed.data.nameAr,
        version: parsed.data.version,
        noticeHours: parsed.data.noticeHours,
        allowsCancellation: parsed.data.allowsCancellation,
        allowsRescheduling: parsed.data.allowsRescheduling,
        allowsLateRequests: parsed.data.allowsLateRequests,
        policyTextAr: parsed.data.policyTextAr,
        active: parsed.data.active,
        isDefault: parsed.data.isDefault,
      };
      const saved = existing
        ? await tx.cancellationPolicy.update({ where: { id: existing.id }, data })
        : await tx.cancellationPolicy.create({ data });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: existing ? 'CANCELLATION_POLICY_UPDATED' : 'CANCELLATION_POLICY_CREATED',
          entityType: 'CancellationPolicy',
          entityId: saved.id,
          beforeJson: existing ? {
            code: existing.code,
            nameAr: existing.nameAr,
            version: existing.version,
            noticeHours: existing.noticeHours,
            allowsCancellation: existing.allowsCancellation,
            allowsRescheduling: existing.allowsRescheduling,
            allowsLateRequests: existing.allowsLateRequests,
            policyTextAr: existing.policyTextAr,
            active: existing.active,
            isDefault: existing.isDefault,
          } : undefined,
          afterJson: {
            code: saved.code,
            nameAr: saved.nameAr,
            version: saved.version,
            noticeHours: saved.noticeHours,
            allowsCancellation: saved.allowsCancellation,
            allowsRescheduling: saved.allowsRescheduling,
            allowsLateRequests: saved.allowsLateRequests,
            policyTextAr: saved.policyTextAr,
            active: saved.active,
            isDefault: saved.isDefault,
          },
        },
      });
      return saved;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    revalidateCatalog();
    return { success: true, policyId: policy.id, message: 'تم حفظ سياسة الإلغاء.' };
  } catch (error) {
    if (error instanceof Error && error.message === 'POLICY_NOT_FOUND') return { error: 'سياسة الإلغاء غير موجودة.' };
    if (error instanceof Error && error.message === 'POLICY_IN_USE') return { error: 'لا يمكن تعطيل سياسة مرتبطة بخدمة نشطة. انقل الخدمات إلى سياسة أخرى أو عطّلها أولًا.' };
    if (error instanceof Error && error.message === 'DEFAULT_POLICY_REQUIRED') return { error: 'عيّن سياسة افتراضية بديلة قبل إزالة صفة الافتراضية من هذه السياسة.' };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: 'كود سياسة الإلغاء مستخدم بالفعل.' };
    }
    return { error: catalogError(error) };
  }
}

export async function saveServiceAddonAction(formData: FormData) {
  const actor = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);
  const parsed = addonSchema.safeParse({
    addonId: formData.get('addonId') || undefined,
    nameAr: formData.get('nameAr'),
    nameEn: formData.get('nameEn') || undefined,
    price: formData.get('price'),
    durationMinutes: formData.get('durationMinutes'),
    slotCount: formData.get('slotCount'),
    active: bool(formData.get('active')),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات الإضافة غير مكتملة.' };

  try {
    const addon = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`catalog-addon:${parsed.data.addonId ?? parsed.data.nameAr}`}))`;
      const existing = parsed.data.addonId
        ? await tx.serviceAddon.findUnique({ where: { id: parsed.data.addonId } })
        : null;
      if (parsed.data.addonId && !existing) throw new Error('ADDON_NOT_FOUND');
      const data = {
        nameAr: parsed.data.nameAr,
        nameEn: parsed.data.nameEn || null,
        price: parsed.data.price,
        durationMinutes: parsed.data.durationMinutes,
        slotCount: parsed.data.slotCount,
        active: parsed.data.active,
      };
      const saved = existing
        ? await tx.serviceAddon.update({ where: { id: existing.id }, data })
        : await tx.serviceAddon.create({ data });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: existing ? 'SERVICE_ADDON_UPDATED' : 'SERVICE_ADDON_CREATED',
          entityType: 'ServiceAddon',
          entityId: saved.id,
          beforeJson: existing ? { nameAr: existing.nameAr, price: existing.price, active: existing.active } : undefined,
          afterJson: { nameAr: saved.nameAr, price: saved.price, durationMinutes: saved.durationMinutes, active: saved.active },
        },
      });
      return saved;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    revalidateCatalog();
    return { success: true, addonId: addon.id, message: 'تم حفظ الإضافة.' };
  } catch (error) {
    if (error instanceof Error && error.message === 'ADDON_NOT_FOUND') return { error: 'الإضافة غير موجودة.' };
    return { error: catalogError(error) };
  }
}

export async function toggleServiceStatusAction(formData: FormData) {
  const actor = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);
  const serviceId = formData.get('serviceId');
  if (typeof serviceId !== 'string' || !serviceId) {
    return { error: 'معرّف الخدمة غير صالح.' };
  }

  try {
    const service = await db.$transaction(async (tx) => {
      const existing = await tx.service.findUnique({
        where: { id: serviceId },
        select: { id: true, nameAr: true, active: true },
      });
      if (!existing) throw new Error('SERVICE_NOT_FOUND');

      const nextActive = !existing.active;
      const updated = await tx.service.update({
        where: { id: serviceId },
        data: { active: nextActive },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: nextActive ? 'SERVICE_ACTIVATED' : 'SERVICE_DEACTIVATED',
          entityType: 'Service',
          entityId: serviceId,
          beforeJson: { active: existing.active },
          afterJson: { active: nextActive },
        },
      });

      return updated;
    });

    revalidateCatalog();
    return {
      success: true,
      active: service.active,
      message: service.active ? 'تم تفعيل الخدمة بنجاح.' : 'تم إيقاف الخدمة مؤقتًا.',
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'SERVICE_NOT_FOUND') {
      return { error: 'الخدمة غير موجودة.' };
    }
    return { error: catalogError(error) };
  }
}

export async function toggleServiceBookableOnlineAction(formData: FormData) {
  const actor = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);
  const serviceId = formData.get('serviceId');
  if (typeof serviceId !== 'string' || !serviceId) {
    return { error: 'معرّف الخدمة غير صالح.' };
  }

  try {
    const service = await db.$transaction(async (tx) => {
      const existing = await tx.service.findUnique({
        where: { id: serviceId },
        select: { id: true, nameAr: true, bookableOnline: true },
      });
      if (!existing) throw new Error('SERVICE_NOT_FOUND');

      const nextBookable = !existing.bookableOnline;
      const updated = await tx.service.update({
        where: { id: serviceId },
        data: { bookableOnline: nextBookable },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: nextBookable ? 'SERVICE_ONLINE_BOOKING_ENABLED' : 'SERVICE_ONLINE_BOOKING_DISABLED',
          entityType: 'Service',
          entityId: serviceId,
          beforeJson: { bookableOnline: existing.bookableOnline },
          afterJson: { bookableOnline: nextBookable },
        },
      });

      return updated;
    });

    revalidateCatalog();
    return {
      success: true,
      bookableOnline: service.bookableOnline,
      message: service.bookableOnline ? 'تم فتح الحجز الإلكتروني للخدمة.' : 'تم تعطيل الحجز الإلكتروني للخدمة.',
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'SERVICE_NOT_FOUND') {
      return { error: 'الخدمة غير موجودة.' };
    }
    return { error: catalogError(error) };
  }
}


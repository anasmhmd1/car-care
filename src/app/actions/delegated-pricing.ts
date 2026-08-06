'use server';

import { Prisma, UserRole } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { canAccessBranch } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { databaseIdSchema } from '@/lib/validations/database-id';

const delegatedPriceSchema = z.object({
  serviceId: databaseIdSchema,
  branchId: databaseIdSchema.optional(),
  price: z.preprocess(
    (value) => value === '' || value === null ? null : value,
    z.coerce.number().int().min(0, 'السعر لا يمكن أن يكون سالبًا.').max(1_000_000).nullable(),
  ),
}).superRefine((value, context) => {
  if (!value.branchId && value.price === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['price'],
      message: 'السعر الأساسي مطلوب.',
    });
  }
});

const PRICING_ROLES = [
  UserRole.OPERATIONS_MANAGER,
  UserRole.OWNER,
  UserRole.SYSTEM_SUPER_ADMIN,
] as const;

function revalidatePricing(serviceId: string) {
  revalidatePath('/operations/pricing');
  revalidatePath('/operations');
  revalidatePath('/admin/catalog');
  revalidatePath('/services');
  revalidatePath(`/services/${serviceId}`);
  revalidatePath('/plans');
  revalidatePath('/');
}

/**
 * A deliberately narrow price-only action. It cannot create services, alter
 * availability, change deposits, delete variants, or toggle catalog state.
 */
export async function updateDelegatedServicePriceAction(formData: FormData) {
  const actor = await requireRole([...PRICING_ROLES]);
  const parsed = delegatedPriceSchema.safeParse({
    serviceId: formData.get('serviceId'),
    branchId: formData.get('branchId') || undefined,
    price: formData.get('price'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات السعر غير صالحة.' };
  }

  const scope = parsed.data.branchId
    ? { type: 'BRANCH' as const, id: parsed.data.branchId }
    : undefined;
  if (
    !(await hasPermission(actor, 'catalog.price.manage', scope)) ||
    (parsed.data.branchId && !(await canAccessBranch(actor, parsed.data.branchId)))
  ) {
    return { error: 'لا تملك تفويض إدارة السعر في هذا النطاق.' };
  }

  try {
    await db.$transaction(async (tx) => {
      const lockKey = parsed.data.branchId
        ? `catalog-price:${parsed.data.branchId}:${parsed.data.serviceId}`
        : `catalog-price:global:${parsed.data.serviceId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      if (parsed.data.branchId) {
        const before = await tx.branchService.findUnique({
          where: {
            branchId_serviceId: {
              branchId: parsed.data.branchId,
              serviceId: parsed.data.serviceId,
            },
          },
          select: {
            id: true,
            branchId: true,
            serviceId: true,
            priceOverride: true,
          },
        });
        if (!before) throw new Error('BRANCH_SERVICE_NOT_FOUND');

        await tx.branchService.update({
          where: { id: before.id },
          data: { priceOverride: parsed.data.price },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: actor.id,
            actorRole: actor.role,
            action: 'BRANCH_SERVICE_PRICE_UPDATED',
            entityType: 'BranchService',
            entityId: before.id,
            beforeJson: { priceOverride: before.priceOverride },
            afterJson: { priceOverride: parsed.data.price },
            reason: 'تعديل سعر الفرع بتفويض صريح محدود بالأسعار',
          },
        });
        return;
      }

      const before = await tx.service.findUnique({
        where: { id: parsed.data.serviceId },
        select: { id: true, basePrice: true },
      });
      if (!before) throw new Error('SERVICE_NOT_FOUND');
      const nextPrice = parsed.data.price;
      if (nextPrice === null) throw new Error('PRICE_REQUIRED');
      await tx.service.update({
        where: { id: before.id },
        data: { basePrice: nextPrice },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'SERVICE_BASE_PRICE_UPDATED',
          entityType: 'Service',
          entityId: before.id,
          beforeJson: { basePrice: before.basePrice },
          afterJson: { basePrice: nextPrice },
          reason: 'تعديل السعر الأساسي بتفويض عالمي صريح محدود بالأسعار',
        },
      });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 15_000,
    });

    revalidatePricing(parsed.data.serviceId);
    return { success: true };
  } catch (error) {
    if (error instanceof Error && error.message === 'BRANCH_SERVICE_NOT_FOUND') {
      return { error: 'الخدمة غير مفعّلة في هذا الفرع؛ لا يمكن إنشاء إعدادات كتالوج من شاشة الأسعار.' };
    }
    if (error instanceof Error && error.message === 'SERVICE_NOT_FOUND') {
      return { error: 'الخدمة غير موجودة.' };
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    ) {
      return { error: 'تغير السعر أثناء الحفظ؛ حدّث الصفحة وحاول مرة أخرى.' };
    }
    console.error('Delegated price update failed:', error);
    return { error: 'تعذر حفظ السعر.' };
  }
}

'use server';

import { Prisma, UserRole } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  serviceCollectionsListSchema,
  DEFAULT_SERVICE_COLLECTIONS,
  type ServiceCollection,
} from '@/lib/service-collections';

export async function saveServiceCollectionsAction(collections: ServiceCollection[]) {
  const actor = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);

  const parsed = serviceCollectionsListSchema.safeParse(collections);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات المجموعات غير صحيحة.' };
  }

  const validCollections = parsed.data;

  try {
    const saved = await db.$transaction(async (tx) => {
      const brand = await tx.brandSettings.findFirst({ select: { id: true, homepageContent: true } });
      const currentContent = (brand?.homepageContent && typeof brand.homepageContent === 'object' && !Array.isArray(brand.homepageContent))
        ? (brand.homepageContent as Record<string, unknown>)
        : {};

      const updatedHomepageContent = {
        ...currentContent,
        serviceCollections: validCollections,
      } as Prisma.InputJsonValue;

      const record = brand
        ? await tx.brandSettings.update({
            where: { id: brand.id },
            data: { homepageContent: updatedHomepageContent },
          })
        : await tx.brandSettings.create({
            data: {
              singletonKey: 'BAREEQ',
              brandNameAr: 'بريق',
              brandNameEn: 'Bareeq',
              homepageContent: updatedHomepageContent,
            },
          });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'UPDATE_SERVICE_COLLECTIONS',
          entityType: 'BrandSettings',
          entityId: record.id,
          afterJson: { count: validCollections.length },
        },
      });

      return record;
    });

    revalidatePath('/');
    revalidatePath('/services');
    revalidatePath('/admin/site');
    revalidatePath('/admin/catalog');
    return { success: true, brandId: saved.id, message: 'تم حفظ وتحديث مجموعات الخدمات بنجاح.' };
  } catch (error) {
    console.error('Error saving service collections:', error);
    return { error: 'تعذر حفظ مجموعات الخدمات.' };
  }
}

export async function resetServiceCollectionsAction() {
  return saveServiceCollectionsAction(DEFAULT_SERVICE_COLLECTIONS);
}

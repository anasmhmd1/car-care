'use server';

import { Prisma, UserRole } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  galleryItemsListSchema,
  DEFAULT_GALLERY_ITEMS,
  type GalleryItem,
} from '@/lib/gallery-items';

export async function saveGalleryAction(galleryItems: GalleryItem[]) {
  const actor = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);

  const parsed = galleryItemsListSchema.safeParse(galleryItems);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات معرض الصور غير صحيحة.' };
  }

  const validItems = parsed.data;

  try {
    const saved = await db.$transaction(async (tx) => {
      const brand = await tx.brandSettings.findFirst({ select: { id: true, homepageContent: true } });
      const currentContent = (brand?.homepageContent && typeof brand.homepageContent === 'object' && !Array.isArray(brand.homepageContent))
        ? (brand.homepageContent as Record<string, unknown>)
        : {};

      const updatedHomepageContent = {
        ...currentContent,
        gallery: validItems,
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
          action: 'UPDATE_GALLERY_ITEMS',
          entityType: 'BrandSettings',
          entityId: record.id,
          afterJson: { count: validItems.length },
        },
      });

      return record;
    });

    revalidatePath('/');
    revalidatePath('/admin/site');
    return { success: true, brandId: saved.id, message: 'تم حفظ وتحديث معرض الصور بنجاح.' };
  } catch (error) {
    console.error('Error saving gallery items:', error);
    return { error: 'تعذر حفظ معرض الصور.' };
  }
}

export async function resetGalleryAction() {
  return saveGalleryAction(DEFAULT_GALLERY_ITEMS);
}

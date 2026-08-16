'use server';

import { Prisma, UserRole } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  policiesContentSchema,
  DEFAULT_POLICIES_CONTENT,
  type PoliciesContent,
} from '@/lib/policies-content';

export async function savePoliciesAction(policies: PoliciesContent) {
  const actor = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);

  const parsed = policiesContentSchema.safeParse(policies);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات السياسات غير صحيحة.' };
  }

  const validPolicies = parsed.data;

  try {
    const saved = await db.$transaction(async (tx) => {
      const brand = await tx.brandSettings.findFirst({ select: { id: true, homepageContent: true } });
      const currentContent = (brand?.homepageContent && typeof brand.homepageContent === 'object' && !Array.isArray(brand.homepageContent))
        ? (brand.homepageContent as Record<string, unknown>)
        : {};

      const updatedHomepageContent = {
        ...currentContent,
        policies: validPolicies,
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
          action: 'UPDATE_POLICIES_CONTENT',
          entityType: 'BrandSettings',
          entityId: record.id,
          afterJson: { termsSections: validPolicies.termsSections.length, privacySections: validPolicies.privacySections.length },
        },
      });

      return record;
    });

    revalidatePath('/');
    revalidatePath('/policies/terms');
    revalidatePath('/policies/booking');
    revalidatePath('/policies/privacy');
    revalidatePath('/admin/site');
    return { success: true, brandId: saved.id, message: 'تم حفظ وتحديث نصوص السياسات والشروط بنجاح.' };
  } catch (error) {
    console.error('Error saving policies:', error);
    return { error: 'تعذر حفظ نصوص السياسات.' };
  }
}

export async function resetPoliciesAction() {
  return savePoliciesAction(DEFAULT_POLICIES_CONTENT);
}

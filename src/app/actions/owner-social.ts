'use server';

import { Prisma, UserRole } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  socialLinksSchema,
  DEFAULT_SOCIAL_LINKS,
  type SocialLinks,
} from '@/lib/social-links';

const saveSocialAndContactInputSchema = z.object({
  facebook: z.string().trim().max(500).optional().default(''),
  tiktok: z.string().trim().max(500).optional().default(''),
  instagram: z.string().trim().max(500).optional().default(''),
  branchId: z.string().trim().max(200).optional(),
  phone: z.string().trim().regex(/^[\d+\-\s()]{8,20}$/, 'رقم الهاتف غير صالح.').optional().or(z.literal('')),
  whatsapp: z.string().trim().regex(/^[\d+\-\s()]{8,20}$/, 'رقم الواتساب غير صالح.').optional().or(z.literal('')),
});

export interface SaveSocialAndContactResult {
  success?: true;
  message?: string;
  error?: string;
}

export async function saveSocialAndContactAction(
  formData: FormData,
): Promise<SaveSocialAndContactResult> {
  const actor = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);

  const raw = {
    facebook: (formData.get('facebook') as string) ?? '',
    tiktok: (formData.get('tiktok') as string) ?? '',
    instagram: (formData.get('instagram') as string) ?? '',
    branchId: (formData.get('branchId') as string) ?? undefined,
    phone: (formData.get('phone') as string) ?? undefined,
    whatsapp: (formData.get('whatsapp') as string) ?? undefined,
  };

  const parsed = saveSocialAndContactInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'البيانات المدخلة غير صحيحة.' };
  }

  const { facebook, tiktok, instagram, branchId, phone, whatsapp } = parsed.data;

  const socialLinks: SocialLinks = {
    facebook: facebook.trim(),
    tiktok: tiktok.trim(),
    instagram: instagram.trim(),
  };

  try {
    await db.$transaction(async (tx) => {
      // 1. Update BrandSettings homepageContent with socialLinks
      const brand = await tx.brandSettings.findFirst({
        select: { id: true, homepageContent: true },
      });

      const currentContent =
        brand?.homepageContent &&
        typeof brand.homepageContent === 'object' &&
        !Array.isArray(brand.homepageContent)
          ? (brand.homepageContent as Record<string, unknown>)
          : {};

      const updatedHomepageContent = {
        ...currentContent,
        socialLinks,
      } as Prisma.InputJsonValue;

      const updatedBrand = brand
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

      // 2. If branchId or phone/whatsapp provided, update the branch contact
      let targetBranch = null;
      if (branchId) {
        targetBranch = await tx.branch.findUnique({
          where: { id: branchId },
          select: { id: true, nameAr: true, phone: true, whatsapp: true },
        });
      } else if (phone || whatsapp) {
        targetBranch = await tx.branch.findFirst({
          where: { status: 'ACTIVE' },
          select: { id: true, nameAr: true, phone: true, whatsapp: true },
          orderBy: { createdAt: 'asc' },
        });
      }

      if (targetBranch && (phone || whatsapp)) {
        await tx.branch.update({
          where: { id: targetBranch.id },
          data: {
            ...(phone ? { phone } : {}),
            ...(whatsapp ? { whatsapp } : {}),
          },
        });
      }

      // 3. Write Audit Log
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'UPDATE_SOCIAL_AND_CONTACT_SETTINGS',
          entityType: 'BrandSettings',
          entityId: updatedBrand.id,
          afterJson: {
            socialLinks,
            branchId: targetBranch?.id ?? null,
            phone: phone ?? targetBranch?.phone ?? null,
            whatsapp: whatsapp ?? targetBranch?.whatsapp ?? null,
          },
        },
      });
    });

    // 4. Revalidate all public paths and admin pages
    revalidatePath('/');
    revalidatePath('/contact');
    revalidatePath('/areas');
    revalidatePath('/services');
    revalidatePath('/plans');
    revalidatePath('/faq');
    revalidatePath('/policies/terms');
    revalidatePath('/policies/privacy');
    revalidatePath('/policies/booking');
    revalidatePath('/policies/cancellation');
    revalidatePath('/admin/site');
    revalidatePath('/admin/setup');
    revalidatePath('/admin');
    revalidatePath('/api/public/contact');

    return {
      success: true,
      message: 'تم حفظ وتحديث روابط التواصل الاجتماعي وأرقام التواصل بنجاح.',
    };
  } catch (error) {
    console.error('Error saving social and contact settings:', error);
    return { error: 'تعذر حفظ بيانات التواصل. الرجاء المحاولة مرة أخرى.' };
  }
}

export async function resetSocialLinksAction(): Promise<SaveSocialAndContactResult> {
  const formData = new FormData();
  formData.set('facebook', DEFAULT_SOCIAL_LINKS.facebook);
  formData.set('tiktok', DEFAULT_SOCIAL_LINKS.tiktok);
  formData.set('instagram', DEFAULT_SOCIAL_LINKS.instagram);
  return saveSocialAndContactAction(formData);
}

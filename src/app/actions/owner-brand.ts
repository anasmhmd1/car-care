'use server';

import { Prisma, UserRole } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  faqListSchema,
  homepageContentSchema,
  type HomepageContent,
} from '@/lib/homepage-content';

const branchPhoneSchema = z.string().trim().regex(
  /^\+?\d{10,15}$/,
  'رقم الهاتف يجب أن يحتوي من 10 إلى 15 رقمًا.',
);

const createBranchSchema = z.object({
  nameAr: z.string().trim().min(2, 'اسم الفرع مطلوب.').max(120),
  nameEn: z.string().trim().max(120).optional(),
  code: z.string().trim().toUpperCase().regex(
    /^[A-Z0-9-]{3,24}$/,
    'كود الفرع يقبل حروفًا إنجليزية وأرقامًا وشرطات فقط.',
  ),
  address: z.string().trim().min(5, 'العنوان التفصيلي للفرع مطلوب.').max(500),
  phone: branchPhoneSchema,
  whatsapp: branchPhoneSchema,
  dailyBookingLimit: z.coerce.number().int().min(1).max(500),
});

class OwnerBrandActionError extends Error {}

function actionError(error: unknown, fallback: string) {
  if (error instanceof OwnerBrandActionError) return error.message;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return 'كود الفرع مستخدم بالفعل.';
  }
  console.error(fallback, error);
  return fallback;
}

function revalidateBranchPaths() {
  revalidatePath('/admin');
  revalidatePath('/admin/branches');
  revalidatePath('/admin/setup');
  revalidatePath('/areas');
  revalidatePath('/contact');
  revalidatePath('/');
}

/**
 * Creates a branch directly for an owner/system administrator. The advisory
 * lock makes the max-branches rule safe across concurrent requests.
 */
export async function createBranchDirectAction(formData: FormData) {
  const actor = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);
  const parsed = createBranchSchema.safeParse({
    nameAr: formData.get('nameAr'),
    nameEn: formData.get('nameEn') || undefined,
    code: formData.get('code'),
    address: formData.get('address'),
    phone: formData.get('phone'),
    whatsapp: formData.get('whatsapp'),
    dailyBookingLimit: formData.get('dailyBookingLimit') || 20,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات الفرع غير مكتملة.' };
  }

  try {
    const branch = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('bareeq:branch-limit'))`;

      const [brand, branchCount, duplicateCode] = await Promise.all([
        tx.brandSettings.findFirst({ select: { id: true, maxBranches: true } }),
        tx.branch.count(),
        tx.branch.findUnique({ where: { code: parsed.data.code }, select: { id: true } }),
      ]);

      if (duplicateCode) {
        throw new OwnerBrandActionError('كود الفرع مستخدم بالفعل.');
      }

      const maximum = brand?.maxBranches ?? 1;
      if (branchCount >= maximum) {
        throw new OwnerBrandActionError(
          `تم الوصول إلى الحد المسموح به للبراند (${maximum} فرع). ارفع الحد من إدارة النظام قبل إضافة فرع جديد.`,
        );
      }

      if (!brand) {
        await tx.brandSettings.create({
          data: {
            singletonKey: 'BAREEQ',
            brandNameAr: 'بريق',
            brandNameEn: 'Bareeq',
            maxBranches: maximum,
          },
        });
      }

      const created = await tx.branch.create({
        data: {
          nameAr: parsed.data.nameAr,
          nameEn: parsed.data.nameEn || parsed.data.nameAr,
          code: parsed.data.code,
          address: parsed.data.address,
          phone: parsed.data.phone,
          whatsapp: parsed.data.whatsapp,
          timezone: 'Africa/Cairo',
          slotUnitMinutes: 60,
          arrivalWindowMinutes: 30,
          travelBufferMinutes: 30,
          dailyBookingLimit: parsed.data.dailyBookingLimit,
          assignmentMode: 'MANUAL',
          status: 'ACTIVE',
        },
      });

      await Promise.all([
        tx.branchMembership.create({
          data: { branchId: created.id, userId: actor.id },
        }),
        tx.branchWorkingHours.createMany({
          data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
            branchId: created.id,
            dayOfWeek,
            openTime: '09:00',
            closeTime: '17:00',
            isClosed: dayOfWeek === 5,
          })),
        }),
        tx.auditLog.create({
          data: {
            actorUserId: actor.id,
            actorRole: actor.role,
            action: 'CREATE_BRANCH_DIRECT',
            entityType: 'Branch',
            entityId: created.id,
            afterJson: {
              code: created.code,
              nameAr: created.nameAr,
              dailyBookingLimit: created.dailyBookingLimit,
              defaultWorkingHours: '09:00-17:00, Friday closed',
              ownerMembershipAdded: true,
            },
          },
        }),
      ]);

      return created;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 20_000,
    });

    revalidateBranchPaths();
    return {
      success: true,
      branchId: branch.id,
      message: `تم إنشاء فرع ${branch.nameAr} وإضافتك إليه وساعات العمل الافتراضية بنجاح.`,
    };
  } catch (error) {
    return { error: actionError(error, 'تعذر إنشاء الفرع الآن.') };
  }
}

function contentFromFormData(formData: FormData): HomepageContent {
  return homepageContentSchema.parse({
    heroEyebrow: formData.get('heroEyebrow'),
    heroTitle: formData.get('heroTitle'),
    heroAccent: formData.get('heroAccent'),
    heroDescription: formData.get('heroDescription'),
    heroPrimaryCta: formData.get('heroPrimaryCta'),
    heroSecondaryCta: formData.get('heroSecondaryCta'),
    valueTitle: formData.get('valueTitle'),
    whyEyebrow: formData.get('whyEyebrow'),
    whyTitle: formData.get('whyTitle'),
    whyDescription: formData.get('whyDescription'),
    stepsEyebrow: formData.get('stepsEyebrow'),
    stepsTitle: formData.get('stepsTitle'),
    servicesEyebrow: formData.get('servicesEyebrow'),
    servicesTitle: formData.get('servicesTitle'),
    plansEyebrow: formData.get('plansEyebrow'),
    plansTitle: formData.get('plansTitle'),
    testimonialsEyebrow: formData.get('testimonialsEyebrow'),
    testimonialsTitle: formData.get('testimonialsTitle'),
    coverageEyebrow: formData.get('coverageEyebrow'),
    coverageTitle: formData.get('coverageTitle'),
    contactEyebrow: formData.get('contactEyebrow'),
    contactTitle: formData.get('contactTitle'),
    contactDescription: formData.get('contactDescription'),
    closingTitle: formData.get('closingTitle'),
    closingDescription: formData.get('closingDescription'),
  });
}

export async function updateHomepageContentAction(formData: FormData) {
  const actor = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);

  let content: HomepageContent;
  try {
    content = contentFromFormData(formData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? 'تحقق من حقول المحتوى.' };
    }
    return { error: 'تعذر قراءة محتوى الصفحة الرئيسية.' };
  }

  try {
    const saved = await db.$transaction(async (tx) => {
      const brand = await tx.brandSettings.findFirst({ select: { id: true } });
      const homepageContent = content as Prisma.InputJsonValue;
      const record = brand
        ? await tx.brandSettings.update({
            where: { id: brand.id },
            data: { homepageContent },
          })
        : await tx.brandSettings.create({
            data: {
              singletonKey: 'BAREEQ',
              brandNameAr: 'بريق',
              brandNameEn: 'Bareeq',
              homepageContent,
            },
          });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'UPDATE_HOMEPAGE_CONTENT',
          entityType: 'BrandSettings',
          entityId: record.id,
          afterJson: { contentVersion: 1, fields: Object.keys(content) },
        },
      });
      return record;
    });

    revalidatePath('/');
    revalidatePath('/admin');
    revalidatePath('/admin/site');
    return { success: true, brandId: saved.id, message: 'تم حفظ محتوى الصفحة الرئيسية ونشره.' };
  } catch (error) {
    return { error: actionError(error, 'تعذر حفظ محتوى الصفحة الرئيسية.') };
  }
}

export async function updateFaqsContentAction(formData: FormData) {
  const actor = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);
  const rawValue = formData.get('faqsJson');
  const rawJson = typeof rawValue === 'string' ? rawValue.trim() : '';

  let faqsList: z.infer<typeof faqListSchema>;
  try {
    const parsed = faqListSchema.safeParse(JSON.parse(rawJson));
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'بيانات الأسئلة الشائعة غير صحيحة.' };
    }
    faqsList = parsed.data;
  } catch {
    return { error: 'تعذر قراءة الأسئلة الشائعة. تأكد من إدخال البيانات بصورة صحيحة.' };
  }

  try {
    const saved = await db.$transaction(async (tx) => {
      const brand = await tx.brandSettings.findFirst({ select: { id: true } });
      const record = brand
        ? await tx.brandSettings.update({
            where: { id: brand.id },
            data: { faqs: faqsList as unknown as Prisma.InputJsonValue },
          })
        : await tx.brandSettings.create({
            data: {
              singletonKey: 'BAREEQ',
              brandNameAr: 'بريق',
              brandNameEn: 'Bareeq',
              faqs: faqsList as unknown as Prisma.InputJsonValue,
            },
          });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'UPDATE_FAQS_CONTENT',
          entityType: 'BrandSettings',
          entityId: record.id,
          afterJson: { count: faqsList.length },
        },
      });
      return record;
    });

    revalidatePath('/faq');
    revalidatePath('/');
    revalidatePath('/admin/site');
    return { success: true, brandId: saved.id, message: 'تم حفظ الأسئلة الشائعة ونشرها بنجاح.' };
  } catch {
    return { error: 'تعذر حفظ الأسئلة الشائعة. تأكد من إدخال البيانات بصورة صحيحة.' };
  }
}

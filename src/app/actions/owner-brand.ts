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

const branchPhoneSchema = z.string().trim().optional().default('');

const createBranchSchema = z.object({
  nameAr: z.string().trim().min(2, 'اسم الفرع مطلوب.').max(120),
  nameEn: z.string().trim().max(120).optional(),
  code: z.string().trim().toUpperCase().regex(
    /^[A-Z0-9-]{3,24}$/,
    'كود الفرع يقبل حروفًا إنجليزية وأرقامًا وشرطات فقط.',
  ),
  address: z.string().trim().min(3, 'العنوان أو النطاق التشغيلي للفرع مطلوب.').max(500),
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

const updateBranchSchema = z.object({
  branchId: z.string().min(1, 'معرف الفرع مطلوب.'),
  nameAr: z.string().trim().min(2, 'اسم الفرع مطلوب.').max(120),
  nameEn: z.string().trim().max(120).optional(),
  code: z.string().trim().toUpperCase().regex(
    /^[A-Z0-9-]{3,24}$/,
    'كود الفرع يقبل حروفًا إنجليزية وأرقامًا وشرطات فقط.',
  ),
  address: z.string().trim().min(3, 'العنوان أو النطاق التشغيلي للفرع مطلوب.').max(500),
  phone: branchPhoneSchema,
  whatsapp: branchPhoneSchema,
  dailyBookingLimit: z.coerce.number().int().min(1).max(500),
  assignmentMode: z.enum(['MANUAL', 'AUTOMATIC']).default('MANUAL'),
  status: z.enum(['ACTIVE', 'PAUSED', 'DISABLED']).default('ACTIVE'),
});

/**
 * Creates a branch directly for an owner/system administrator.
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

      const nextMax = Math.max(brand?.maxBranches ?? 1, branchCount + 10);
      if (brand) {
        if (branchCount >= brand.maxBranches) {
          await tx.brandSettings.update({
            where: { id: brand.id },
            data: { maxBranches: nextMax },
          });
        }
      } else {
        await tx.brandSettings.create({
          data: {
            singletonKey: 'BAREEQ',
            brandNameAr: 'بريق',
            brandNameEn: 'Bareeq',
            maxBranches: nextMax,
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
          restBufferMinutes: 0,
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

/**
 * Updates an existing branch directly for an owner/system administrator.
 */
export async function updateBranchAction(formData: FormData) {
  const actor = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);
  const parsed = updateBranchSchema.safeParse({
    branchId: formData.get('branchId'),
    nameAr: formData.get('nameAr'),
    nameEn: formData.get('nameEn') || undefined,
    code: formData.get('code'),
    address: formData.get('address'),
    phone: formData.get('phone'),
    whatsapp: formData.get('whatsapp'),
    dailyBookingLimit: formData.get('dailyBookingLimit') || 20,
    assignmentMode: formData.get('assignmentMode') || 'MANUAL',
    status: formData.get('status') || 'ACTIVE',
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات الفرع غير مكتملة أو غير صالحة.' };
  }

  try {
    const existing = await db.branch.findUnique({
      where: { id: parsed.data.branchId },
      select: {
        id: true,
        code: true,
        nameAr: true,
        nameEn: true,
        address: true,
        phone: true,
        whatsapp: true,
        status: true,
        assignmentMode: true,
        dailyBookingLimit: true,
      },
    });

    if (!existing) {
      return { error: 'الفرع المحدد غير موجود.' };
    }

    if (existing.code !== parsed.data.code) {
      const duplicateCode = await db.branch.findUnique({
        where: { code: parsed.data.code },
        select: { id: true },
      });
      if (duplicateCode) {
        return { error: 'كود الفرع الجديد مستخدم بالفعل لفرع آخر.' };
      }
    }

    const updated = await db.$transaction(async (tx) => {
      const branch = await tx.branch.update({
        where: { id: parsed.data.branchId },
        data: {
          nameAr: parsed.data.nameAr,
          nameEn: parsed.data.nameEn || parsed.data.nameAr,
          code: parsed.data.code,
          address: parsed.data.address,
          phone: parsed.data.phone,
          whatsapp: parsed.data.whatsapp,
          dailyBookingLimit: parsed.data.dailyBookingLimit,
          assignmentMode: parsed.data.assignmentMode,
          status: parsed.data.status,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'UPDATE_BRANCH',
          entityType: 'Branch',
          entityId: branch.id,
          beforeJson: {
            nameAr: existing.nameAr,
            code: existing.code,
            address: existing.address,
            phone: existing.phone,
            whatsapp: existing.whatsapp,
            status: existing.status,
            assignmentMode: existing.assignmentMode,
            dailyBookingLimit: existing.dailyBookingLimit,
          },
          afterJson: {
            nameAr: branch.nameAr,
            code: branch.code,
            address: branch.address,
            phone: branch.phone,
            whatsapp: branch.whatsapp,
            status: branch.status,
            assignmentMode: branch.assignmentMode,
            dailyBookingLimit: branch.dailyBookingLimit,
          },
        },
      });

      return branch;
    });

    revalidateBranchPaths();
    return {
      success: true,
      branchId: updated.id,
      message: `تم تحديث بيانات فرع "${updated.nameAr}" بنجاح.`,
    };
  } catch (error) {
    return { error: actionError(error, 'تعذر تحديث بيانات الفرع الآن.') };
  }
}

const deleteBranchSchema = z.object({
  branchId: z.string().min(1, 'معرف الفرع مطلوب.'),
  reason: z.string().trim().max(500).optional(),
});

/**
 * Deletes a branch if it has no bookings or active subscriptions,
 * and if it's not the only remaining branch in the system.
 */
export async function deleteBranchAction(formData: FormData) {
  const actor = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);
  const parsed = deleteBranchSchema.safeParse({
    branchId: formData.get('branchId'),
    reason: formData.get('reason') || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'معرف الفرع غير صالح.' };
  }

  try {
    const totalBranches = await db.branch.count();
    if (totalBranches <= 1) {
      return { error: 'لا يمكن حذف الفرع الوحيد المتبقي في المنظومة. يجب أن تحتوي العلامة التجارية على فرع واحد على الأقل.' };
    }

    const branch = await db.branch.findUnique({
      where: { id: parsed.data.branchId },
      select: {
        id: true,
        nameAr: true,
        code: true,
        _count: {
          select: {
            bookings: true,
            subscriptions: true,
            invoices: true,
          },
        },
      },
    });

    if (!branch) {
      return { error: 'الفرع المحدد غير موجود.' };
    }

    if (branch._count.bookings > 0 || branch._count.subscriptions > 0 || branch._count.invoices > 0) {
      return {
        error: `لا يمكن حذف فرع "${branch.nameAr}" لوجود سجلات مرتبطة به (${branch._count.bookings} حجز، ${branch._count.subscriptions} اشتراك). يمكنك تغيير حالة الفرع إلى "معطل" أو "متوقف مؤقتاً" لإيقاف استقبال الحجوزات.`,
      };
    }

    await db.$transaction(async (tx) => {
      // Clean child records in order of foreign key dependencies
      await tx.branchWorkingHours.deleteMany({ where: { branchId: branch.id } });
      await tx.branchBlackoutDate.deleteMany({ where: { branchId: branch.id } });
      await tx.branchPaymentMethod.deleteMany({ where: { branchId: branch.id } });
      await tx.branchService.deleteMany({ where: { branchId: branch.id } });
      await tx.subscriptionPlanBranch.deleteMany({ where: { branchId: branch.id } });
      await tx.coverageArea.deleteMany({ where: { zone: { branchId: branch.id } } });
      await tx.coverageZone.deleteMany({ where: { branchId: branch.id } });
      await tx.teamMember.deleteMany({ where: { team: { branchId: branch.id } } });
      await tx.teamZone.deleteMany({ where: { team: { branchId: branch.id } } });
      await tx.teamCapability.deleteMany({ where: { team: { branchId: branch.id } } });
      await tx.teamTimeOff.deleteMany({ where: { team: { branchId: branch.id } } });
      await tx.teamWorkingHours.deleteMany({ where: { team: { branchId: branch.id } } });
      await tx.team.deleteMany({ where: { branchId: branch.id } });
      await tx.branchMembership.deleteMany({ where: { branchId: branch.id } });
      await tx.branchMaterialStock.deleteMany({ where: { branchId: branch.id } });
      await tx.operationalVehicle.deleteMany({ where: { branchId: branch.id } });

      await tx.branch.delete({ where: { id: branch.id } });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'DELETE_BRANCH',
          entityType: 'Branch',
          entityId: branch.id,
          reason: parsed.data.reason ?? 'حذف الفرع بواسطة المالك',
          beforeJson: {
            nameAr: branch.nameAr,
            code: branch.code,
          },
        },
      });
    });

    revalidateBranchPaths();
    return {
      success: true,
      message: `تم حذف فرع "${branch.nameAr}" بنجاح.`,
    };
  } catch (error) {
    return { error: actionError(error, 'تعذر حذف الفرع الآن.') };
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

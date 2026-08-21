'use server';

import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/session';
import { revokeAllUserSessionsAndBumpVersion } from '@/lib/auth/session-store';
import {
  canAccessBranch,
} from '@/lib/auth/authorization';
import {
  canManageWorkforceAccount,
  isAppRole,
} from '@/lib/auth/policy';
import { logAudit } from '@/lib/audit';
import {
  SubscriptionPlanAdminError,
  createManagedSubscriptionPlan,
  retireManagedSubscriptionPlan,
  updateManagedSubscriptionPlan,
} from '@/lib/engine/subscription-plan';
import {
  createSubscriptionPlanSchema,
  retireSubscriptionPlanFormValues,
  retireSubscriptionPlanSchema,
  subscriptionPlanFormValues,
  updateSubscriptionPlanSchema,
} from '@/lib/validations/subscription-plan';
import { ownerCustomerAccountSchema } from '@/lib/validations/admin';
import { phoneLookupCandidates, phoneSchema } from '@/lib/validations/phone';
import { faqListSchema } from '@/lib/homepage-content';
import { revalidatePath } from 'next/cache';
import {
  BranchRequestStatus,
  PaymentMethodType,
  Prisma,
  UserRole,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const FORBIDDEN_TEMP_PASSWORDS = new Set(['EmpPass2026!', 'OwnerPass2026!']);

function parseStringArray(value: FormDataEntryValue | null): string[] | null {
  if (value === null || value === '') return [];
  if (typeof value !== 'string') return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
      return null;
    }
    return [...new Set(parsed)];
  } catch {
    return null;
  }
}

function isAcceptableTemporaryPassword(password: string): boolean {
  return password.length >= 12 && !FORBIDDEN_TEMP_PASSWORDS.has(password);
}

export async function createServiceAction(formData: FormData) {
  const owner = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);

  const nameAr = (formData.get('nameAr') as string || '').trim();
  const slug = (formData.get('slug') as string || '').trim().toLowerCase();
  const shortDescriptionAr = (formData.get('shortDescriptionAr') as string || '').trim();
  const descriptionAr = (formData.get('descriptionAr') as string || '').trim();
  const basePrice = parseFloat(formData.get('basePrice') as string || '0');
  const durationMinutes = parseInt(formData.get('durationMinutes') as string || '60', 10);
  const requiredTeamSize = parseInt(formData.get('requiredTeamSize') as string || '2', 10);

  if (!nameAr || !slug || !basePrice) {
    return { error: 'يرجى إدخال البيانات الأساسية للخدمة (الاسم، المعرّف، والسعر)' };
  }

  const existing = await db.service.findUnique({ where: { slug } });
  if (existing) {
    return { error: 'الرمز المختصر (slug) مستخدم بالفعل لخدمة أخرى' };
  }

  const cancellationPolicy = await db.cancellationPolicy.findFirst({
    where: { active: true, isDefault: true },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  });
  if (!cancellationPolicy) {
    return { error: 'يجب إعداد سياسة إلغاء افتراضية نشطة قبل إنشاء خدمة جديدة' };
  }

  const service = await db.service.create({
    data: {
      cancellationPolicyId: cancellationPolicy.id,
      nameAr,
      nameEn: nameAr,
      slug,
      shortDescriptionAr,
      fullDescriptionAr: descriptionAr || shortDescriptionAr,
      coverImage: '/images/service-care.svg',
      basePrice,
      durationMinutes,
      requiredTeamSize,
      active: true,
    },
  });

  await logAudit({
    actorUserId: owner.id,
    actorRole: owner.role,
    action: 'CREATE_SERVICE',
    entityType: 'Service',
    entityId: service.id,
  });

  revalidatePath('/admin');
  revalidatePath('/services');
  return { success: true, serviceId: service.id };
}

export async function createTeamAction(formData: FormData) {
  const actor = await requireRole([UserRole.OWNER, UserRole.OPERATIONS_MANAGER, UserRole.SYSTEM_SUPER_ADMIN]);

  const name = (formData.get('name') as string || '').trim();
  const branchId = (formData.get('branchId') as string || '').trim();
  const dailyCapacity = parseInt(formData.get('dailyCapacity') as string || '5', 10);
  const zoneIds = parseStringArray(formData.get('zoneIds'));

  if (!name || !branchId || !Number.isInteger(dailyCapacity) || dailyCapacity < 1) {
    return { error: 'بيانات فريق التشغيل غير مكتملة' };
  }
  if (zoneIds === null) return { error: 'بيانات نطاقات التغطية غير صالحة' };

  const branch = await db.branch.findUnique({ where: { id: branchId }, select: { id: true } });
  if (!branch) return { error: 'الفرع غير موجود' };
  if (!(await canAccessBranch(actor, branchId))) return { error: 'غير مصرح لك بإدارة هذا الفرع' };

  if (zoneIds.length > 0) {
    const validZoneCount = await db.coverageZone.count({
      where: { id: { in: zoneIds }, branchId },
    });
    if (validZoneCount !== zoneIds.length) {
      return { error: 'كل نطاقات التغطية يجب أن تتبع نفس الفرع' };
    }
  }

  const team = await db.$transaction(async (tx) => {
    const createdTeam = await tx.team.create({
      data: { branchId, name, dailyCapacity, active: true },
    });
    if (zoneIds.length > 0) {
      await tx.teamZone.createMany({
        data: zoneIds.map((zoneId) => ({ teamId: createdTeam.id, zoneId })),
      });
    }
    return createdTeam;
  });

  await logAudit({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'CREATE_TEAM',
    entityType: 'Team',
    entityId: team.id,
  });

  revalidatePath('/admin');
  revalidatePath('/operations');
  return { success: true, teamId: team.id, message: `تم إضافة فريق "${name}" وترخيصه على الزونات المختارة بنجاح!` };
}

export async function updateTeamAction(formData: FormData) {
  const actor = await requireRole([UserRole.OWNER, UserRole.OPERATIONS_MANAGER, UserRole.SYSTEM_SUPER_ADMIN]);

  const teamId = formData.get('teamId') as string;
  const name = (formData.get('name') as string || '').trim();
  const dailyCapacity = parseInt(formData.get('dailyCapacity') as string || '5', 10);
  const zoneIds = formData.has('zoneIds')
    ? parseStringArray(formData.get('zoneIds'))
    : undefined;
  const memberIds = formData.has('memberIds')
    ? parseStringArray(formData.get('memberIds'))
    : undefined;

  if (!teamId || !name || !Number.isInteger(dailyCapacity) || dailyCapacity < 1) {
    return { error: 'بيانات الفريق غير مكتملة' };
  }
  if (zoneIds === null || memberIds === null) return { error: 'بيانات الفريق غير صالحة' };

  const team = await db.team.findUnique({ where: { id: teamId } });
  if (!team) return { error: 'الفريق غير موجود' };
  if (!(await canAccessBranch(actor, team.branchId))) return { error: 'غير مصرح لك بإدارة هذا الفريق' };

  if (zoneIds && zoneIds.length > 0) {
    const validZoneCount = await db.coverageZone.count({
      where: { id: { in: zoneIds }, branchId: team.branchId },
    });
    if (validZoneCount !== zoneIds.length) {
      return { error: 'نطاق تغطية واحد أو أكثر خارج فرع الفريق' };
    }
  }

  if (memberIds && memberIds.length > 0) {
    const validMemberCount = await db.user.count({
      where: {
        id: { in: memberIds },
        role: UserRole.EMPLOYEE,
        active: true,
        branchMemberships: { some: { branchId: team.branchId } },
      },
    });
    if (validMemberCount !== memberIds.length) {
      return { error: 'كل أعضاء الفريق يجب أن يكونوا موظفين نشطين في نفس الفرع' };
    }

    const memberInAnotherTeam = await db.teamMember.findFirst({
      where: { userId: { in: memberIds }, teamId: { not: teamId } },
      select: { id: true },
    });
    if (memberInAnotherTeam) return { error: 'أحد الموظفين مسند بالفعل إلى فريق آخر' };
  }

  await db.$transaction(async (tx) => {
    await tx.team.update({ where: { id: teamId }, data: { name, dailyCapacity } });
    if (zoneIds) {
      await tx.teamZone.deleteMany({ where: { teamId } });
      if (zoneIds.length > 0) {
        await tx.teamZone.createMany({ data: zoneIds.map((zoneId) => ({ teamId, zoneId })) });
      }
    }
    if (memberIds) {
      await tx.teamMember.deleteMany({ where: { teamId } });
      if (memberIds.length > 0) {
        await tx.teamMember.createMany({ data: memberIds.map((userId) => ({ teamId, userId })) });
      }
    }
  });

  await logAudit({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'UPDATE_TEAM',
    entityType: 'Team',
    entityId: teamId,
    beforeJson: { name: team.name, dailyCapacity: team.dailyCapacity },
    afterJson: { name, dailyCapacity, zoneIds, memberIds },
  });

  revalidatePath('/admin');
  revalidatePath('/operations');
  return { success: true, message: `تم تحديث فريق "${name}" وأعضائه وزوناته بنجاح!` };
}

export async function deleteTeamAction(formData: FormData) {
  const actor = await requireRole([UserRole.OWNER, UserRole.OPERATIONS_MANAGER, UserRole.SYSTEM_SUPER_ADMIN]);
  const teamId = formData.get('teamId') as string;
  if (!teamId) return { error: 'معرف الفريق مطلوب' };

  const team = await db.team.findUnique({ where: { id: teamId } });
  if (!team) return { error: 'الفريق غير موجود' };
  if (!(await canAccessBranch(actor, team.branchId))) return { error: 'غير مصرح لك بإدارة هذا الفريق' };

  await db.team.update({ where: { id: teamId }, data: { active: false } });
  await logAudit({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'DEACTIVATE_TEAM',
    entityType: 'Team',
    entityId: teamId,
    beforeJson: { active: team.active },
    afterJson: { active: false },
  });

  revalidatePath('/admin');
  revalidatePath('/operations');
  return { success: true, message: 'تم حذف الفريق بنجاح' };
}

export async function createCoverageZoneAction(formData: FormData) {
  const actor = await requireRole([UserRole.OWNER, UserRole.OPERATIONS_MANAGER, UserRole.SYSTEM_SUPER_ADMIN]);
  const branchId = formData.get('branchId') as string;
  const name = (formData.get('name') as string || '').trim();
  const description = (formData.get('description') as string || '').trim();

  if (!branchId || !name) {
    return { error: 'اسم الزون والفرع مطلوبان' };
  }

  const branch = await db.branch.findUnique({ where: { id: branchId }, select: { id: true } });
  if (!branch) return { error: 'الفرع غير موجود' };
  if (!(await canAccessBranch(actor, branchId))) return { error: 'غير مصرح لك بإدارة هذا الفرع' };

  const zone = await db.coverageZone.create({
    data: {
      branchId,
      name,
      description: description || null,
    },
  });

  await logAudit({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'CREATE_COVERAGE_ZONE',
    entityType: 'CoverageZone',
    entityId: zone.id,
    afterJson: { branchId, name },
  });

  revalidatePath('/admin');
  revalidatePath('/areas');
  return { success: true, zoneId: zone.id };
}

export async function updateCoverageZoneAction(formData: FormData) {
  const actor = await requireRole([UserRole.OWNER, UserRole.OPERATIONS_MANAGER, UserRole.SYSTEM_SUPER_ADMIN]);
  const zoneId = formData.get('zoneId') as string;
  const name = (formData.get('name') as string || '').trim();
  const description = (formData.get('description') as string || '').trim();
  const areaIds = parseStringArray(formData.get('areaIds'));

  if (!zoneId || !name) {
    return { error: 'معرف الزون والاسم مطلوبان' };
  }
  if (areaIds === null) return { error: 'بيانات مناطق التغطية غير صالحة' };

  const zone = await db.coverageZone.findUnique({ where: { id: zoneId } });
  if (!zone) return { error: 'نطاق التغطية غير موجود' };
  if (!(await canAccessBranch(actor, zone.branchId))) return { error: 'غير مصرح لك بإدارة هذا النطاق' };

  if (areaIds.length > 0) {
    const validAreaCount = await db.coverageArea.count({
      where: { id: { in: areaIds }, zone: { branchId: zone.branchId } },
    });
    if (validAreaCount !== areaIds.length) {
      return { error: 'لا يمكن نقل مناطق من فرع آخر إلى هذا النطاق' };
    }
  }

  await db.$transaction(async (tx) => {
    await tx.coverageZone.update({
      where: { id: zoneId },
      data: { name, description: description || null },
    });
    if (areaIds.length > 0) {
      await tx.coverageArea.updateMany({
        where: { id: { in: areaIds }, zone: { branchId: zone.branchId } },
        data: { zoneId },
      });
    }
  });

  await logAudit({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'UPDATE_COVERAGE_ZONE',
    entityType: 'CoverageZone',
    entityId: zoneId,
    beforeJson: { name: zone.name, description: zone.description },
    afterJson: { name, description: description || null, areaIds },
  });

  revalidatePath('/admin');
  revalidatePath('/areas');
  return { success: true, message: `تم تحديث بيانات الزون "${name}" والمناطق التابعة له بنجاح!` };
}

export async function deleteCoverageZoneAction(formData: FormData) {
  const actor = await requireRole([UserRole.OWNER, UserRole.OPERATIONS_MANAGER, UserRole.SYSTEM_SUPER_ADMIN]);
  const zoneId = formData.get('zoneId') as string;

  if (!zoneId) return { error: 'معرف الزون مطلوب' };

  const zone = await db.coverageZone.findUnique({ where: { id: zoneId } });
  if (!zone) return { error: 'نطاق التغطية غير موجود' };
  if (!(await canAccessBranch(actor, zone.branchId))) return { error: 'غير مصرح لك بإدارة هذا النطاق' };

  const [areaCount, teamLinkCount] = await Promise.all([
    db.coverageArea.count({ where: { zoneId } }),
    db.teamZone.count({ where: { zoneId } }),
  ]);
  if (areaCount > 0 || teamLinkCount > 0) {
    return { error: 'لا يمكن حذف نطاق مرتبط بمناطق أو فرق؛ انقل الارتباطات أولاً' };
  }

  await db.coverageZone.delete({
    where: { id: zoneId },
  });

  await logAudit({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'DELETE_COVERAGE_ZONE',
    entityType: 'CoverageZone',
    entityId: zoneId,
    beforeJson: { branchId: zone.branchId, name: zone.name },
  });

  revalidatePath('/admin');
  revalidatePath('/areas');
  return { success: true, message: 'تم حذف الزون بنجاح' };
}

export async function createCoverageAreaAction(formData: FormData) {
  const actor = await requireRole([UserRole.OWNER, UserRole.OPERATIONS_MANAGER, UserRole.SYSTEM_SUPER_ADMIN]);

  const zoneId = formData.get('zoneId') as string;
  const compound = (formData.get('compound') as string || '').trim();
  const district = (formData.get('district') as string || '').trim();
  const city = (formData.get('city') as string || '').trim();
  const governorate = (formData.get('governorate') as string || '').trim();

  if (!zoneId || !compound) {
    return { error: 'اسم المنطقة والزون مطلوبان' };
  }

  const zone = await db.coverageZone.findUnique({ where: { id: zoneId }, select: { branchId: true } });
  if (!zone) return { error: 'نطاق التغطية غير موجود' };
  if (!(await canAccessBranch(actor, zone.branchId))) return { error: 'غير مصرح لك بإدارة هذا النطاق' };

  const area = await db.coverageArea.create({
    data: {
      zoneId,
      compound,
      district: district || compound,
      city,
      governorate,
      active: true,
    },
  });

  await logAudit({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'CREATE_COVERAGE_AREA',
    entityType: 'CoverageArea',
    entityId: area.id,
    afterJson: { zoneId, compound },
  });

  revalidatePath('/admin');
  revalidatePath('/areas');
  return { success: true, areaId: area.id };
}

export async function updateCoverageAreaAction(formData: FormData) {
  const actor = await requireRole([UserRole.OWNER, UserRole.OPERATIONS_MANAGER, UserRole.SYSTEM_SUPER_ADMIN]);

  const areaId = formData.get('areaId') as string;
  const compound = (formData.get('compound') as string || '').trim();
  const district = (formData.get('district') as string || '').trim();
  const city = (formData.get('city') as string || '').trim();
  const governorate = (formData.get('governorate') as string || '').trim();
  const active = formData.get('active') === 'true';

  if (!areaId || !compound) {
    return { error: 'بيانات المنطقة غير مكتملة' };
  }

  const area = await db.coverageArea.findUnique({
    where: { id: areaId },
    include: { zone: { select: { branchId: true } } },
  });
  if (!area) return { error: 'منطقة التغطية غير موجودة' };
  if (!(await canAccessBranch(actor, area.zone.branchId))) return { error: 'غير مصرح لك بإدارة هذه المنطقة' };

  await db.coverageArea.update({
    where: { id: areaId },
    data: {
      compound,
      district: district || compound,
      city,
      governorate,
      active,
    },
  });

  await logAudit({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'UPDATE_COVERAGE_AREA',
    entityType: 'CoverageArea',
    entityId: areaId,
    beforeJson: { compound: area.compound, active: area.active },
    afterJson: { compound, active },
  });

  revalidatePath('/admin');
  revalidatePath('/areas');
  return { success: true, message: 'تم تحديث منطقة التغطية' };
}

export async function deleteCoverageAreaAction(formData: FormData) {
  const actor = await requireRole([UserRole.OWNER, UserRole.OPERATIONS_MANAGER, UserRole.SYSTEM_SUPER_ADMIN]);
  const areaId = formData.get('areaId') as string;
  if (!areaId) return { error: 'معرف المنطقة مطلوب' };

  const area = await db.coverageArea.findUnique({
    where: { id: areaId },
    include: { zone: { select: { branchId: true } } },
  });
  if (!area) return { error: 'منطقة التغطية غير موجودة' };
  if (!(await canAccessBranch(actor, area.zone.branchId))) return { error: 'غير مصرح لك بإدارة هذه المنطقة' };

  await db.coverageArea.update({ where: { id: areaId }, data: { active: false } });
  await logAudit({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'DEACTIVATE_COVERAGE_AREA',
    entityType: 'CoverageArea',
    entityId: areaId,
    beforeJson: { active: area.active },
    afterJson: { active: false },
  });

  revalidatePath('/admin');
  revalidatePath('/areas');
  return { success: true, message: 'تم حذف منطقة التغطية' };
}

function revalidateSubscriptionPlanPaths(): void {
  revalidatePath('/');
  revalidatePath('/admin');
  revalidatePath('/admin/subscriptions');
  revalidatePath('/admin/site');
  revalidatePath('/plans');
  revalidatePath('/account');
  revalidatePath('/account/subscriptions');
  revalidatePath('/account/subscriptions/[id]', 'page');
  revalidatePath('/services/[slug]/book', 'page');
}

function subscriptionPlanActionError(error: unknown, fallback: string): { error: string } {
  if (error instanceof SubscriptionPlanAdminError) {
    return { error: error.message };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return { error: 'يوجد تعارض مع خطة أو علاقة مسجلة بالفعل. حدّث الصفحة وأعد المحاولة.' };
    }
    if (error.code === 'P2034') {
      return { error: 'تغيرت بيانات الخطط بالتزامن. أعد المحاولة.' };
    }
    if (error.code === 'P2003') {
      return { error: 'لا يمكن حذف الخطة لأنها أصبحت مرتبطة بسجل تشغيلي. عطّلها بدلًا من حذفها.' };
    }
  }
  console.error('Subscription plan action failed:', error);
  return { error: fallback };
}

export async function createSubscriptionPlanAction(formData: FormData) {
  const actor = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);
  const parsed = createSubscriptionPlanSchema.safeParse(subscriptionPlanFormValues(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات خطة الاشتراك غير مكتملة.' };
  }

  try {
    const plan = await db.$transaction(
      (tx) => createManagedSubscriptionPlan(tx, {
        userId: actor.id,
        role: actor.role,
      }, parsed.data),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 20_000,
      },
    );
    revalidateSubscriptionPlanPaths();
    return { success: true, planId: plan.id, message: 'تم إنشاء خطة الاشتراك وتوثيقها.' };
  } catch (error) {
    return subscriptionPlanActionError(error, 'تعذر إنشاء خطة الاشتراك.');
  }
}

export async function updateSubscriptionPlanAction(formData: FormData) {
  const actor = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);
  const parsed = updateSubscriptionPlanSchema.safeParse(subscriptionPlanFormValues(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات خطة الاشتراك غير مكتملة.' };
  }

  try {
    const plan = await db.$transaction(
      (tx) => updateManagedSubscriptionPlan(tx, {
        userId: actor.id,
        role: actor.role,
      }, parsed.data),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 20_000,
      },
    );
    revalidateSubscriptionPlanPaths();
    return { success: true, planId: plan.id, message: 'تم تحديث خطة الاشتراك وتوثيق التغيير.' };
  } catch (error) {
    return subscriptionPlanActionError(error, 'تعذر تحديث خطة الاشتراك.');
  }
}

export async function deleteSubscriptionPlanAction(formData: FormData) {
  const actor = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);
  const parsed = retireSubscriptionPlanSchema.safeParse(retireSubscriptionPlanFormValues(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات تعطيل الخطة غير مكتملة.' };
  }

  try {
    const result = await db.$transaction(
      (tx) => retireManagedSubscriptionPlan(tx, {
        userId: actor.id,
        role: actor.role,
      }, parsed.data),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 20_000,
      },
    );
    revalidateSubscriptionPlanPaths();
    return {
      success: true,
      planId: result.planId,
      message: result.deleted
        ? 'تم حذف الخطة غير المستخدمة نهائيًا وتوثيق السبب.'
        : 'تم تعطيل الخطة. اشتراكات العملاء السابقة محفوظة.',
    };
  } catch (error) {
    return subscriptionPlanActionError(error, 'تعذر تنفيذ الإجراء على خطة الاشتراك.');
  }
}

export async function updateFaqsAction(faqs: unknown): Promise<{ success?: boolean; message?: string; error?: string }> {
  try {
    await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);
    const parsed = faqListSchema.safeParse(faqs);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'بيانات الأسئلة الشائعة غير صحيحة.' };
    }
    const faqsJson = parsed.data as unknown as Prisma.InputJsonValue;

    const brand = await db.brandSettings.findFirst();
    if (brand) {
      await db.brandSettings.update({
        where: { id: brand.id },
        data: { faqs: faqsJson },
      });
    } else {
      await db.brandSettings.create({
        data: {
          brandNameAr: 'بريق',
          brandNameEn: 'Bareeq',
          faqs: faqsJson,
        },
      });
    }

    revalidatePath('/admin');
    revalidatePath('/faq');
    revalidatePath('/');
    return { success: true, message: 'تم تحديث الأسئلة الشائعة بنجاح' };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'حدث خطأ أثناء تحديث الأسئلة الشائعة' };
  }
}

export async function createChecklistAction(formData: FormData) {
  const owner = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);

  const titleAr = (formData.get('titleAr') as string || '').trim();
  const serviceId = (formData.get('serviceId') as string || '').trim();

  if (!titleAr || !serviceId) return { error: 'عنوان قائمة الفحص والخدمة مطلوبان' };

  const service = await db.service.findUnique({ where: { id: serviceId }, select: { id: true } });
  if (!service) return { error: 'الخدمة غير موجودة' };

  const checklist = await db.checklistTemplate.create({
    data: {
      name: titleAr,
      stage: 'SERVICE_EXECUTION',
      serviceId,
    },
  });

  await logAudit({
    actorUserId: owner.id,
    actorRole: owner.role,
    action: 'CREATE_CHECKLIST_TEMPLATE',
    entityType: 'ChecklistTemplate',
    entityId: checklist.id,
    afterJson: { titleAr, serviceId },
  });

  revalidatePath('/admin');
  return { success: true, checklistId: checklist.id };
}

export async function createPaymentMethodAction(formData: FormData) {
  const owner = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);

  const branchId = (formData.get('branchId') as string || '').trim();
  const nameAr = (formData.get('nameAr') as string || '').trim();
  const typeValue = (formData.get('type') as string || 'INSTAPAY').trim();
  const walletNumber = (formData.get('walletNumber') as string || '').trim();
  const iban = (formData.get('iban') as string || '').trim();
  const instructionsAr = (formData.get('instructionsAr') as string || '').trim();
  const accountNumber = walletNumber || iban;

  if (!branchId || !nameAr || !accountNumber) {
    return { error: 'الفرع واسم وسيلة الدفع ورقم الحساب/المحفظة مطلوبة' };
  }
  if (!Object.values(PaymentMethodType).includes(typeValue as PaymentMethodType)) {
    return { error: 'نوع وسيلة الدفع غير صالح' };
  }

  const branch = await db.branch.findUnique({ where: { id: branchId }, select: { id: true } });
  if (!branch) return { error: 'الفرع غير موجود' };

  const method = await db.branchPaymentMethod.create({
    data: {
      branchId,
      name: nameAr,
      type: typeValue as PaymentMethodType,
      accountNumber,
      accountName: nameAr,
      instructions: instructionsAr || null,
      active: true,
    },
  });

  await logAudit({
    actorUserId: owner.id,
    actorRole: owner.role,
    action: 'CREATE_BRANCH_PAYMENT_METHOD',
    entityType: 'BranchPaymentMethod',
    entityId: method.id,
    afterJson: { branchId, name: nameAr, type: typeValue },
  });

  revalidatePath('/admin');
  return { success: true, methodId: method.id };
}

export async function requestNewBranchAction(formData: FormData) {
  const owner = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);

  const branchName = (formData.get('branchName') as string || '').trim();
  const reason = (formData.get('reason') as string || 'إضافة فرع جديد للمالك').trim();

  if (!branchName || !reason) {
    return { error: 'يرجى إدخال اسم الفرع وسبب الطلب' };
  }

  const duplicateRequest = await db.branchRequest.findFirst({
    where: {
      ownerId: owner.id,
      branchName: { equals: branchName, mode: 'insensitive' },
      status: { in: [BranchRequestStatus.PENDING, BranchRequestStatus.NEEDS_INFORMATION] },
    },
    select: { id: true, status: true, reason: true },
  });
  if (duplicateRequest?.status === BranchRequestStatus.PENDING) {
    return { error: 'يوجد طلب مفتوح بالفعل لهذا الفرع' };
  }

  if (duplicateRequest?.status === BranchRequestStatus.NEEDS_INFORMATION) {
    await db.$transaction(async (tx) => {
      await tx.branchRequest.update({
        where: { id: duplicateRequest.id },
        data: {
          reason,
          rejectionReason: null,
          status: BranchRequestStatus.PENDING,
          reviewedByUserId: null,
          reviewedAt: null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: owner.id,
          actorRole: owner.role,
          action: 'RESPOND_BRANCH_INFORMATION_REQUEST',
          entityType: 'BranchRequest',
          entityId: duplicateRequest.id,
          beforeJson: { status: duplicateRequest.status, reason: duplicateRequest.reason },
          afterJson: { status: BranchRequestStatus.PENDING, reason },
          reason,
        },
      });
    });
    revalidatePath('/admin');
    revalidatePath('/system-admin');
    return { success: true, message: 'تم إرسال المعلومات الإضافية وإعادة الطلب للمراجعة' };
  }

  const request = await db.branchRequest.create({
    data: {
      ownerId: owner.id,
      branchName,
      reason,
      status: BranchRequestStatus.PENDING,
    },
  });

  await logAudit({
    actorUserId: owner.id,
    actorRole: owner.role,
    action: 'REQUEST_NEW_BRANCH',
    entityType: 'BranchRequest',
    entityId: request.id,
    reason,
    afterJson: { branchName, status: request.status },
  });

  revalidatePath('/admin');
  revalidatePath('/system-admin');
  return {
    success: true,
    message: `تم إرسال طلب فرع "${branchName}" للمراجعة من مدير النظام`,
  };
}

export async function updateServiceAction(formData: FormData) {
  const owner = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);

  const serviceId = formData.get('serviceId') as string;
  const nameAr = (formData.get('nameAr') as string || '').trim();
  const shortDescriptionAr = (formData.get('shortDescriptionAr') as string || '').trim();
  const fullDescriptionAr = (formData.get('fullDescriptionAr') as string || '').trim();
  const basePrice = parseInt(formData.get('basePrice') as string || '0', 10);
  const durationMinutes = parseInt(formData.get('durationMinutes') as string || '60', 10);
  const coverImage = (formData.get('coverImage') as string || '').trim();
  const galleryImagesRaw = formData.get('galleryImages') as string;
  const active = formData.get('active') === 'true';

  let galleryImages: string[] = [];
  if (galleryImagesRaw) {
    try {
      const parsedGalleryImages: unknown = JSON.parse(galleryImagesRaw);
      if (
        Array.isArray(parsedGalleryImages)
        && parsedGalleryImages.every((image): image is string => typeof image === 'string')
      ) {
        galleryImages = parsedGalleryImages;
      }
    } catch {}
  }

  if (!serviceId || !nameAr) {
    return { error: 'بيانات الخدمة غير مكتملة' };
  }

  await db.service.update({
    where: { id: serviceId },
    data: {
      nameAr,
      shortDescriptionAr,
      fullDescriptionAr: fullDescriptionAr || shortDescriptionAr,
      basePrice,
      durationMinutes,
      coverImage: coverImage || galleryImages[0] || '/images/service-care.svg',
      galleryImages,
      active,
    },
  });

  await logAudit({
    actorUserId: owner.id,
    actorRole: owner.role,
    action: 'UPDATE_SERVICE',
    entityType: 'Service',
    entityId: serviceId,
  });

  revalidatePath('/admin');
  revalidatePath('/');
  revalidatePath('/services');
  return { success: true, message: 'تم تحديث الخدمة وصورتها بنجاح' };
}

export async function deleteServiceAction(formData: FormData) {
  const owner = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);
  const serviceId = formData.get('serviceId') as string;

  if (!serviceId) return { error: 'معرف الخدمة مطلوب' };

  await db.service.delete({ where: { id: serviceId } });

  await logAudit({
    actorUserId: owner.id,
    actorRole: owner.role,
    action: 'DELETE_SERVICE',
    entityType: 'Service',
    entityId: serviceId,
  });

  revalidatePath('/admin');
  revalidatePath('/');
  revalidatePath('/services');
  return { success: true, message: 'تم حذف الخدمة بنجاح' };
}

export async function updateBrandLandingAction(formData: FormData) {
  await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);
  const brandNameAr = (formData.get('brandNameAr') as string || '').trim();
  const brandNameEn = (formData.get('brandNameEn') as string || '').trim();

  const brand = await db.brandSettings.findFirst();
  if (brand) {
    await db.brandSettings.update({
      where: { id: brand.id },
      data: { brandNameAr, brandNameEn },
    });
  }

  revalidatePath('/admin');
  revalidatePath('/');
  return { success: true, message: 'تم تحديث بيانات البراند بنجاح' };
}

export async function createEmployeeAction(formData: FormData) {
  const actor = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);

  const fullName = (formData.get('fullName') as string || '').trim();
  const phoneInput = (formData.get('phone') as string || '').trim();
  const email = (formData.get('email') as string || '').trim() || null;
  const password = (formData.get('password') as string || '').trim();
  const roleValue = (formData.get('role') as string || UserRole.EMPLOYEE).trim();
  const branchId = (formData.get('branchId') as string || '').trim();

  if (!fullName || !phoneInput || !branchId) {
    return { error: 'الاسم ورقم الهاتف والفرع مطلوبة لإنشاء حساب الموظف' };
  }
  const parsedPhone = phoneSchema.safeParse(phoneInput);
  if (!parsedPhone.success) return { error: parsedPhone.error.errors[0]?.message || 'رقم الهاتف غير صالح' };
  const phone = parsedPhone.data;
  if (!isAppRole(roleValue) || !canManageWorkforceAccount(actor.role, roleValue)) {
    return { error: 'الدور المطلوب غير مسموح في إدارة الموظفين' };
  }
  if (!isAcceptableTemporaryPassword(password)) {
    return { error: 'كلمة المرور المؤقتة يجب أن تكون 12 حرفاً على الأقل وألا تكون كلمة افتراضية معروفة' };
  }

  const branch = await db.branch.findUnique({ where: { id: branchId }, select: { id: true } });
  if (!branch) return { error: 'الفرع غير موجود' };

  const existing = await db.user.findFirst({
    where: {
      OR: [
        { phone: { in: phoneLookupCandidates(phone) } },
        ...(email ? [{ email }] : []),
      ],
    },
    select: { id: true },
  });
  if (existing) {
    return { error: 'رقم الهاتف أو البريد الإلكتروني مسجل بالفعل لدى مستخدم آخر' };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const newEmp = await db.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        fullName,
        phone,
        email,
        passwordHash,
        role: roleValue as UserRole,
        active: true,
        mustChangePwd: true,
      },
    });
    await tx.branchMembership.create({
      data: { branchId, userId: createdUser.id },
    });
    return createdUser;
  });

  await logAudit({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'CREATE_EMPLOYEE',
    entityType: 'User',
    entityId: newEmp.id,
    afterJson: { fullName, phone, role: roleValue, branchId },
  });

  revalidatePath('/admin');
  revalidatePath('/operations');
  return { success: true, message: `تم إنشاء حساب الموظف "${fullName}" وتعيين صلاحياته بنجاح!` };
}

export async function updateBranchSlotConfigAction(formData: FormData) {
  const actor = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);

  const branchId = formData.get('branchId') as string;
  const dailyBookingLimit = parseInt(formData.get('dailyBookingLimit') as string || '20', 10);
  const slotUnitMinutes = parseInt(formData.get('slotUnitMinutes') as string || '60', 10);

  if (
    !branchId ||
    !Number.isInteger(dailyBookingLimit) ||
    dailyBookingLimit < 1 ||
    !Number.isInteger(slotUnitMinutes) ||
    slotUnitMinutes < 15 ||
    slotUnitMinutes > 480
  ) {
    return { error: 'إعدادات الفرع غير صالحة' };
  }

  const branch = await db.branch.findUnique({ where: { id: branchId } });
  if (!branch) return { error: 'الفرع غير موجود' };
  if (!(await canAccessBranch(actor, branchId))) return { error: 'غير مصرح لك بإدارة هذا الفرع' };

  await db.branch.update({
    where: { id: branchId },
    data: {
      dailyBookingLimit,
      slotUnitMinutes,
    },
  });

  await logAudit({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'UPDATE_BRANCH_SLOT_CONFIG',
    entityType: 'Branch',
    entityId: branchId,
    beforeJson: {
      dailyBookingLimit: branch.dailyBookingLimit,
      slotUnitMinutes: branch.slotUnitMinutes,
    },
    afterJson: { dailyBookingLimit, slotUnitMinutes },
  });

  revalidatePath('/admin');
  revalidatePath('/calendar');
  return { success: true, message: 'تم تحديث إعدادات وسعة السلوتات بنجاح!' };
}

/**
 * Owner-only administration for customer identity and account state.
 *
 * This deliberately accepts neither a role nor arbitrary user fields. The
 * target must be a CustomerProfile whose backing User still has CUSTOMER role,
 * which closes the usual role-escalation path through a generic user editor.
 */
export async function updateCustomerAccountAction(formData: FormData) {
  const actor = await requireRole([
    UserRole.OWNER,
    UserRole.SYSTEM_SUPER_ADMIN,
    UserRole.OPERATIONS_MANAGER,
  ]);

  const parsed = ownerCustomerAccountSchema.safeParse({
    customerId: (formData.get('customerId') as string || '').trim(),
    fullName: (formData.get('fullName') as string || '').trim(),
    phone: (formData.get('phone') as string || '').trim(),
    whatsapp: (formData.get('whatsapp') as string || '').trim(),
    email: (formData.get('email') as string || '').trim(),
    active: (formData.get('active') as string || '').trim(),
    notes: (formData.get('notes') as string || '').trim(),
    temporaryPassword: (formData.get('temporaryPassword') as string || '').trim(),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || 'بيانات حساب العميل غير صالحة' };
  }

  const data = parsed.data;
  if (data.temporaryPassword && !isAcceptableTemporaryPassword(data.temporaryPassword)) {
    return { error: 'كلمة المرور المؤقتة يجب أن تتكون من 12 حرفًا على الأقل وألا تكون كلمة افتراضية معروفة' };
  }

  const customer = await db.customerProfile.findUnique({
    where: { id: data.customerId },
    select: {
      id: true,
      userId: true,
      notes: true,
      user: {
        select: {
          id: true,
          fullName: true,
          phone: true,
          whatsapp: true,
          email: true,
          role: true,
          active: true,
          deletedAt: true,
        },
      },
    },
  });
  if (!customer || customer.user.role !== UserRole.CUSTOMER || customer.user.deletedAt) {
    return { error: 'حساب العميل غير موجود أو مؤرشف ولا يمكن تعديله' };
  }

  const conflictingIdentity = await db.user.findFirst({
    where: {
      id: { not: customer.userId },
      OR: [
        { phone: { in: phoneLookupCandidates(data.phone) } },
        ...(data.email ? [{ email: data.email }] : []),
      ],
    },
    select: { id: true },
  });
  if (conflictingIdentity) {
    return { error: 'رقم الهاتف أو البريد الإلكتروني مستخدم بالفعل لحساب آخر' };
  }

  const phoneChanged = customer.user.phone !== data.phone;
  const activeChanged = customer.user.active !== data.active;
  const passwordReset = data.temporaryPassword.length > 0;
  const sessionsMustBeRevoked = phoneChanged || activeChanged || passwordReset;
  const passwordHash = passwordReset ? await bcrypt.hash(data.temporaryPassword, 12) : undefined;
  const normalizedWhatsapp = data.whatsapp || data.phone;
  const normalizedEmail = data.email || null;

  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: customer.userId },
        data: {
          fullName: data.fullName,
          phone: data.phone,
          whatsapp: normalizedWhatsapp,
          email: normalizedEmail,
          active: data.active,
          ...(passwordHash ? { passwordHash, mustChangePwd: true } : {}),
        },
      });

      await tx.customerProfile.update({
        where: { id: customer.id },
        data: {
          notes: data.notes || null,
        },
      });

      if (sessionsMustBeRevoked) {
        const securityReason = passwordReset
          ? 'CUSTOMER_PASSWORD_RESET'
          : activeChanged
            ? (data.active ? 'CUSTOMER_ACCOUNT_ENABLED' : 'CUSTOMER_ACCOUNT_DISABLED')
            : 'CUSTOMER_LOGIN_PHONE_CHANGED';
        await revokeAllUserSessionsAndBumpVersion(tx, customer.userId, securityReason);
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'UPDATE_CUSTOMER_ACCOUNT',
          entityType: 'CustomerProfile',
          entityId: customer.id,
          beforeJson: {
            fullName: customer.user.fullName,
            phone: customer.user.phone,
            whatsapp: customer.user.whatsapp,
            email: customer.user.email,
            active: customer.user.active,
            notes: customer.notes,
          },
          afterJson: {
            fullName: data.fullName,
            phone: data.phone,
            whatsapp: normalizedWhatsapp,
            email: normalizedEmail,
            active: data.active,
            notes: data.notes || null,
            passwordReset,
            sessionsRevoked: sessionsMustBeRevoked,
          },
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: 'رقم الهاتف أو البريد الإلكتروني مستخدم بالفعل لحساب آخر' };
    }
    throw error;
  }

  revalidatePath('/admin');
  revalidatePath('/account');
  revalidatePath('/account/profile');
  return {
    success: true,
    sessionsRevoked: sessionsMustBeRevoked,
    message: passwordReset
      ? 'تم تحديث الحساب وإعادة تعيين كلمة المرور وإلغاء الجلسات السابقة.'
      : sessionsMustBeRevoked
        ? 'تم تحديث حساب العميل وإلغاء الجلسات السابقة لحماية الحساب.'
        : 'تم تحديث بيانات حساب العميل بنجاح.',
  };
}

export async function updateEmployeeAction(formData: FormData) {
  const actor = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);

  const userId = formData.get('userId') as string;
  const fullName = (formData.get('fullName') as string || '').trim();
  const phoneInput = (formData.get('phone') as string || '').trim();
  const password = (formData.get('password') as string || '').trim();
  const active = formData.get('active') !== 'false';

  if (!userId || !fullName || !phoneInput) {
    return { error: 'اسم الموظف ورقم الهاتف معرفان أساسيان مطلوبان' };
  }
  const parsedPhone = phoneSchema.safeParse(phoneInput);
  if (!parsedPhone.success) return { error: parsedPhone.error.errors[0]?.message || 'رقم الهاتف غير صالح' };
  const phone = parsedPhone.data;

  const target = await db.user.findUnique({
    where: { id: userId },
    include: { branchMemberships: { select: { branchId: true } } },
  });
  if (!target) return { error: 'حساب الموظف غير موجود' };

  const roleValue = (formData.get('role') as string || target.role).trim();
  if (
    !isAppRole(roleValue) ||
    !canManageWorkforceAccount(actor.role, target.role, roleValue)
  ) {
    return { error: 'لا يمكنك إدارة هذا الحساب أو تغيير دوره إلى الدور المطلوب' };
  }

  const existingPhone = await db.user.findFirst({
    where: {
      phone: { in: phoneLookupCandidates(phone) },
      id: { not: userId },
    },
  });
  if (existingPhone) {
    return { error: 'رقم الهاتف مستخدم بالفعل لدى حساب آخر' };
  }

  const updateData: {
    fullName: string;
    phone: string;
    role: UserRole;
    active: boolean;
    passwordHash?: string;
    mustChangePwd?: boolean;
  } = {
    fullName,
    phone,
    role: roleValue as UserRole,
    active,
  };

  if (password) {
    if (!isAcceptableTemporaryPassword(password)) {
      return { error: 'كلمة المرور الجديدة يجب أن تكون 12 حرفاً على الأقل وألا تكون كلمة افتراضية معروفة' };
    }
    updateData.passwordHash = await bcrypt.hash(password, 12);
    updateData.mustChangePwd = true;
  }

  const roleChanged = target.role !== roleValue;
  const activeChanged = target.active !== active;
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: updateData,
    });

    if (password || roleChanged || activeChanged) {
      const reason = password
        ? 'PASSWORD_RESET'
        : roleChanged
          ? 'ROLE_CHANGED'
          : active
            ? 'ACCOUNT_ENABLED'
            : 'ACCOUNT_DISABLED';
      await revokeAllUserSessionsAndBumpVersion(tx, userId, reason);
    }
  });

  await logAudit({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'UPDATE_WORKFORCE_ACCOUNT',
    entityType: 'User',
    entityId: userId,
    beforeJson: {
      fullName: target.fullName,
      phone: target.phone,
      role: target.role,
      active: target.active,
    },
    afterJson: { fullName, phone, role: roleValue, active, passwordReset: Boolean(password) },
  });

  revalidatePath('/admin');
  revalidatePath('/operations');
  return { success: true, message: `تم تحديث حساب الموظف "${fullName}" بنجاح!` };
}

export async function deleteEmployeeAction(formData: FormData) {
  const actor = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);
  const userId = formData.get('userId') as string;

  if (!userId) return { error: 'معرف الحساب مطلوب' };
  if (userId === actor.id) return { error: 'لا يمكنك تعطيل حسابك الحالي' };

  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return { error: 'حساب الموظف غير موجود' };
  if (!canManageWorkforceAccount(actor.role, target.role)) {
    return { error: 'لا يمكن لهذا الإجراء تعطيل حساب مالك أو مدير نظام أو عميل' };
  }

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { active: false, deletedAt: new Date() },
    });
    await revokeAllUserSessionsAndBumpVersion(tx, userId, 'ACCOUNT_DELETED');
  });

  await logAudit({
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'DEACTIVATE_WORKFORCE_ACCOUNT',
    entityType: 'User',
    entityId: userId,
    beforeJson: { role: target.role, active: target.active, deletedAt: target.deletedAt },
    afterJson: { active: false, deletedAt: 'set' },
  });

  revalidatePath('/admin');
  revalidatePath('/operations');
  return { success: true, message: 'تم حذف حساب الموظف بنجاح' };
}

export async function toggleCustomerBlockAction(formData: FormData) {
  const actor = await requireRole([
    UserRole.OWNER,
    UserRole.SYSTEM_SUPER_ADMIN,
    UserRole.OPERATIONS_MANAGER,
  ]);

  const customerId = (formData.get('customerId') as string || '').trim();
  const block = formData.get('block') === 'true';
  const reason = (formData.get('reason') as string || '').trim();

  if (!customerId) return { error: 'معرف العميل مطلوب.' };
  if (block && reason.length < 3) {
    return { error: 'يجب كتابة سبب الحظر (3 أحرف على الأقل).' };
  }

  const customer = await db.customerProfile.findUnique({
    where: { id: customerId },
    include: { user: true },
  });

  if (!customer || customer.user.role !== UserRole.CUSTOMER || customer.user.deletedAt) {
    return { error: 'حساب العميل غير موجود أو غير صالح.' };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: customer.userId },
        data: {
          active: !block,
          sessionVersion: { increment: 1 },
        },
      });

      const timestamp = new Intl.DateTimeFormat('ar-EG', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date());
      const actionLabel = block ? 'حظر العميل' : 'إلغاء حظر العميل';
      const actorLabel = actor.role === UserRole.OPERATIONS_MANAGER ? 'مدير التشغيل' : 'المالك';
      const entry = `[${actionLabel} بواسطة ${actorLabel} (${actor.fullName}) - ${timestamp}]: ${reason || 'استئناف الحساب'}`;
      const newNotes = customer.notes ? `${customer.notes}\n${entry}` : entry;

      await tx.customerProfile.update({
        where: { id: customer.id },
        data: { notes: newNotes },
      });

      if (block) {
        await revokeAllUserSessionsAndBumpVersion(tx, customer.userId, 'CUSTOMER_BLOCKED_BY_MANAGEMENT');
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: block ? 'CUSTOMER_BLOCKED' : 'CUSTOMER_UNBLOCKED',
          entityType: 'CustomerProfile',
          entityId: customer.id,
          beforeJson: { active: customer.user.active },
          afterJson: { active: !block, reason },
          reason: reason || null,
        },
      });
    });

    revalidatePath('/admin');
    revalidatePath('/operations');
    return { success: true, message: block ? 'تم حظر العميل بنجاح ومنعه من الحجز وتسجيل الدخول' : 'تم إلغاء حظر العميل واستئناف حسابه بنجاح' };
  } catch {
    return { error: 'تعذر تنفيذ إجراء الحظر/إلغاء الحظر على العميل.' };
  }
}


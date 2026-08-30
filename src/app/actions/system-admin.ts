'use server';

import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/session';
import { revokeAllUserSessionsAndBumpVersion } from '@/lib/auth/session-store';
import { logAudit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';
import { UserRole, BranchRequestStatus, BranchStatus, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { clearLockout } from '@/lib/security/rate-limit';

const FORBIDDEN_TEMP_PASSWORDS = new Set(['EmpPass2026!', 'OwnerPass2026!']);

function isAcceptableTemporaryPassword(password: string): boolean {
  return password.length >= 12 && !FORBIDDEN_TEMP_PASSWORDS.has(password);
}

export async function reviewBranchRequestAction(formData: FormData) {
  const admin = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);

  const requestId = (formData.get('requestId') as string || '').trim();
  const decision = (formData.get('decision') as string || '').trim();
  const rejectionReason = (formData.get('rejectionReason') as string || '').trim();
  const branchCode = (formData.get('branchCode') as string || '').trim().toUpperCase();
  const branchAddress = (formData.get('branchAddress') as string || '').trim();
  const branchPhone = (formData.get('branchPhone') as string || '').trim();
  const branchWhatsapp = (formData.get('branchWhatsapp') as string || '').trim();

  if (!requestId || !['APPROVE', 'REJECT', 'NEEDS_INFORMATION'].includes(decision)) {
    return { error: 'بيانات المراجعة غير مكتملة أو غير صالحة' };
  }
  if (['REJECT', 'NEEDS_INFORMATION'].includes(decision) && rejectionReason.length < 5) {
    return { error: decision === 'REJECT' ? 'سبب رفض طلب الفرع مطلوب' : 'وضح المعلومات الإضافية المطلوبة من المالك' };
  }
  if (decision === 'APPROVE') {
    if (!/^[A-Z0-9-]{3,24}$/.test(branchCode)) {
      return { error: 'كود الفرع مطلوب ويقبل حروفًا إنجليزية وأرقامًا وشرطات فقط' };
    }
    if (branchAddress.length < 5) return { error: 'عنوان الفرع التفصيلي مطلوب' };
    if (!/^\+?\d{10,15}$/.test(branchPhone)) return { error: 'رقم هاتف الفرع غير صالح' };
    if (!/^\+?\d{10,15}$/.test(branchWhatsapp)) return { error: 'رقم واتساب الفرع غير صالح' };
  }

  const request = await db.branchRequest.findUnique({ where: { id: requestId } });
  if (!request) return { error: 'طلب الفرع غير موجود' };
  if (
    request.status !== BranchRequestStatus.PENDING &&
    request.status !== BranchRequestStatus.NEEDS_INFORMATION
  ) {
    return { error: 'تمت مراجعة هذا الطلب بالفعل ولا يمكن مراجعته مرة أخرى' };
  }

  try {
    const reviewed = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('bareeq:branch-limit'))`;
    const freshRequest = await tx.branchRequest.findUnique({ where: { id: requestId } });
    if (
      !freshRequest ||
      (freshRequest.status !== BranchRequestStatus.PENDING && freshRequest.status !== BranchRequestStatus.NEEDS_INFORMATION)
    ) return null;

    let createdBranchId: string | null = null;
    if (decision === 'APPROVE') {
      const [brand, branchCount, duplicateCode] = await Promise.all([
        tx.brandSettings.findFirst(),
        tx.branch.count(),
        tx.branch.findUnique({ where: { code: branchCode }, select: { id: true } }),
      ]);
      if (duplicateCode) throw new Error('DUPLICATE_BRANCH_CODE');
      const nextLimit = Math.max(brand?.maxBranches ?? 1, branchCount + 1);
      if (brand) {
        await tx.brandSettings.update({ where: { id: brand.id }, data: { maxBranches: nextLimit } });
      } else {
        await tx.brandSettings.create({
          data: { id: 'default-brand', brandNameAr: 'بريق', brandNameEn: 'Bareeq', maxBranches: nextLimit },
        });
      }
      const branch = await tx.branch.create({
        data: {
          nameAr: freshRequest.branchName,
          nameEn: freshRequest.branchName,
          code: branchCode,
          address: branchAddress,
          phone: branchPhone,
          whatsapp: branchWhatsapp,
          status: 'ACTIVE',
          timezone: 'Africa/Cairo',
          slotUnitMinutes: 60,
          arrivalWindowMinutes: 30,
          travelBufferMinutes: 30,
          restBufferMinutes: 0,
          dailyBookingLimit: 20,
          assignmentMode: 'MANUAL',
        },
      });
      createdBranchId = branch.id;
      await tx.branchMembership.create({ data: { branchId: branch.id, userId: freshRequest.ownerId } });
      await tx.branchWorkingHours.createMany({
        data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
          branchId: branch.id,
          dayOfWeek,
          openTime: '09:00',
          closeTime: '17:00',
          isClosed: dayOfWeek === 5,
        })),
      });
    }

    const updated = await tx.branchRequest.updateMany({
      where: {
        id: requestId,
        status: { in: [BranchRequestStatus.PENDING, BranchRequestStatus.NEEDS_INFORMATION] },
      },
      data: {
        status: decision === 'APPROVE'
          ? BranchRequestStatus.IMPLEMENTED
          : decision === 'REJECT'
            ? BranchRequestStatus.REJECTED
            : BranchRequestStatus.NEEDS_INFORMATION,
        rejectionReason: decision === 'APPROVE' ? null : rejectionReason,
        reviewedByUserId: admin.id,
        reviewedAt: new Date(),
      },
    });

    if (updated.count !== 1) throw new Error('REQUEST_ALREADY_REVIEWED');
    await tx.auditLog.create({
      data: {
        actorUserId: admin.id,
        actorRole: admin.role,
        action: decision === 'APPROVE'
          ? 'APPROVE_AND_CREATE_BRANCH'
          : decision === 'REJECT'
            ? 'REJECT_BRANCH_REQUEST'
            : 'REQUEST_BRANCH_INFORMATION',
        entityType: 'BranchRequest',
        entityId: requestId,
        beforeJson: { status: freshRequest.status },
        afterJson: {
          status: decision === 'APPROVE'
            ? BranchRequestStatus.IMPLEMENTED
            : decision === 'REJECT'
              ? BranchRequestStatus.REJECTED
              : BranchRequestStatus.NEEDS_INFORMATION,
          createdBranchId,
          branchCode: decision === 'APPROVE' ? branchCode : null,
        },
        reason: rejectionReason || freshRequest.reason,
      },
    });
    return { createdBranchId };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (!reviewed) return { error: 'سبق أن قام مستخدم آخر بمراجعة هذا الطلب' };

  revalidatePath('/system-admin');
  revalidatePath('/admin');
  revalidatePath('/areas');
  return { success: true, branchId: reviewed.createdBranchId };
  } catch (error) {
    if (error instanceof Error && error.message === 'REQUEST_ALREADY_REVIEWED') {
      return { error: 'سبق أن قام مستخدم آخر بمراجعة هذا الطلب' };
    }
    if (error instanceof Error && error.message === 'DUPLICATE_BRANCH_CODE') {
      return { error: 'كود الفرع مستخدم بالفعل' };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: 'كود الفرع أو أحد البيانات الفريدة مستخدم بالفعل' };
    }
    console.error('Branch request review failed:', error);
    return { error: 'تعذر مراجعة الطلب وإنشاء الفرع داخل معاملة واحدة' };
  }
}

export async function resetOwnerPasswordAction(formData: FormData) {
  const admin = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);
  const ownerId = (formData.get('ownerId') as string || '').trim();
  const password = (formData.get('password') as string || '').trim();
  const reason = (formData.get('reason') as string || '').trim();

  if (!ownerId) return { error: 'حساب المالك غير محدد' };
  if (!isAcceptableTemporaryPassword(password)) {
    return { error: 'كلمة المرور المؤقتة يجب أن تكون 12 حرفًا على الأقل وألا تكون كلمة افتراضية معروفة' };
  }
  if (reason.length < 5) return { error: 'سبب إعادة تعيين كلمة المرور مطلوب' };

  const owner = await db.user.findUnique({
    where: { id: ownerId },
    select: { id: true, role: true, fullName: true, phone: true, active: true },
  });
  if (!owner || owner.role !== UserRole.OWNER) return { error: 'حساب المالك غير موجود' };

  const passwordHash = await bcrypt.hash(password, 12);
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: owner.id },
      data: {
        passwordHash,
        mustChangePwd: true,
      },
    });
    await revokeAllUserSessionsAndBumpVersion(tx, owner.id, 'OWNER_PASSWORD_RESET');
    await tx.auditLog.create({
      data: {
        actorUserId: admin.id,
        actorRole: admin.role,
        action: 'RESET_OWNER_PASSWORD',
        entityType: 'User',
        entityId: owner.id,
        beforeJson: { fullName: owner.fullName, active: owner.active },
        afterJson: { mustChangePwd: true, sessionsRevoked: true },
        reason,
      },
    });
  });
  await clearLockout(owner.phone);

  revalidatePath('/system-admin');
  return { success: true };
}

export async function updateBranchStatusAction(formData: FormData) {
  const admin = await requireRole([UserRole.SYSTEM_SUPER_ADMIN, UserRole.OWNER]);
  const branchId = (formData.get('branchId') as string || '').trim();
  const statusValue = (formData.get('status') as string || '').trim();
  const reason = (formData.get('reason') as string || '').trim();
  if (!branchId || !Object.values(BranchStatus).includes(statusValue as BranchStatus)) {
    return { error: 'الفرع أو الحالة الجديدة غير صالحين' };
  }
  if (reason.length < 5) return { error: 'سبب تعديل حالة الفرع مطلوب' };
  const status = statusValue as BranchStatus;

  try {
    await db.$transaction(async (tx) => {
      const branch = await tx.branch.findUnique({
        where: { id: branchId },
        select: { id: true, nameAr: true, status: true },
      });
      if (!branch) throw new Error('BRANCH_NOT_FOUND');
      if (branch.status === status) throw new Error('STATUS_UNCHANGED');
      await tx.branch.update({ where: { id: branch.id }, data: { status } });
      await tx.auditLog.create({
        data: {
          actorUserId: admin.id,
          actorRole: admin.role,
          action: 'SYSTEM_CORRECT_BRANCH_STATUS',
          entityType: 'Branch',
          entityId: branch.id,
          beforeJson: { status: branch.status, nameAr: branch.nameAr },
          afterJson: { status },
          reason,
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'BRANCH_NOT_FOUND') return { error: 'الفرع غير موجود' };
    if (error instanceof Error && error.message === 'STATUS_UNCHANGED') return { error: 'الحالة المختارة هي الحالة الحالية بالفعل' };
    console.error('Branch status correction failed:', error);
    return { error: 'تعذر تعديل حالة الفرع' };
  }

  revalidatePath('/system-admin');
  revalidatePath('/admin');
  revalidatePath('/services');
  revalidatePath('/areas');
  return { success: true };
}

export async function upsertAppSettingAction(formData: FormData) {
  const admin = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);
  const key = (formData.get('key') as string || '').trim().toUpperCase();
  const rawValue = (formData.get('value') as string || '').trim();
  const description = (formData.get('description') as string || '').trim();
  const reason = (formData.get('reason') as string || '').trim();

  if (!/^[A-Z][A-Z0-9_.-]{2,63}$/.test(key)) {
    return { error: 'مفتاح الإعداد يجب أن يبدأ بحرف ويحتوي على حروف إنجليزية وأرقام ونقاط أو شرطات فقط' };
  }
  if (/(SECRET|PASSWORD|TOKEN|CREDENTIAL|PRIVATE_KEY|API_KEY)/.test(key)) {
    return { error: 'الإعدادات الحساسة والأسرار يجب أن تبقى في متغيرات البيئة ولا تُحفظ في قاعدة البيانات' };
  }
  if (!rawValue || rawValue.length > 10_000) return { error: 'قيمة JSON مطلوبة وبحد أقصى 10000 حرف' };
  if (description.length < 3 || reason.length < 5) return { error: 'الوصف وسبب التعديل مطلوبان' };

  let value: Prisma.InputJsonValue;
  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (parsed === null) return { error: 'قيمة null غير مسموحة لهذا الإعداد' };
    value = parsed as Prisma.InputJsonValue;
  } catch {
    return { error: 'قيمة الإعداد ليست JSON صالحًا' };
  }

  await db.$transaction(async (tx) => {
    const before = await tx.appSetting.findUnique({ where: { key } });
    const setting = await tx.appSetting.upsert({
      where: { key },
      update: { value, description, updatedByUserId: admin.id },
      create: { key, value, description, updatedByUserId: admin.id },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: admin.id,
        actorRole: admin.role,
        action: before ? 'UPDATE_APP_SETTING' : 'CREATE_APP_SETTING',
        entityType: 'AppSetting',
        entityId: setting.id,
        beforeJson: before ? { key: before.key, value: before.value, description: before.description } : undefined,
        afterJson: { key: setting.key, value: setting.value, description: setting.description },
        reason,
      },
    });
  });

  revalidatePath('/system-admin');
  return { success: true };
}

export async function createOwnerAccountAction(formData: FormData) {
  const admin = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);

  const fullName = (formData.get('fullName') as string || '').trim();
  const phone = (formData.get('phone') as string || '').trim();
  const email = (formData.get('email') as string || '').trim() || null;
  const password = (formData.get('password') as string || '').trim();

  if (!fullName || !phone || !password) {
    return { error: 'الاسم ورقم الهاتف وكلمة المرور المؤقتة مطلوبة لإنشاء حساب المالك' };
  }
  if (!isAcceptableTemporaryPassword(password)) {
    return { error: 'كلمة المرور المؤقتة يجب أن تكون 12 حرفاً على الأقل وألا تكون كلمة افتراضية معروفة' };
  }

  const existing = await db.user.findFirst({
    where: {
      OR: [
        { phone },
        ...(email ? [{ email }] : []),
      ],
    },
    select: { phone: true, email: true },
  });
  if (existing) return { error: 'رقم الهاتف أو البريد الإلكتروني مسجل بالفعل في النظام' };

  const passwordHash = await bcrypt.hash(password, 12);
  const newOwner = await db.user.create({
    data: {
      fullName,
      phone,
      email,
      passwordHash,
      role: UserRole.OWNER,
      active: true,
      mustChangePwd: true,
    },
  });

  await logAudit({
    actorUserId: admin.id,
    actorRole: admin.role,
    action: 'CREATE_OWNER_ACCOUNT',
    entityType: 'User',
    entityId: newOwner.id,
    afterJson: { fullName, phone, email, role: UserRole.OWNER },
  });

  revalidatePath('/system-admin');
  return { success: true };
}

export async function updateBrandMaxBranchesAction(formData: FormData) {
  const admin = await requireRole([UserRole.SYSTEM_SUPER_ADMIN, UserRole.OWNER]);

  const maxBranches = parseInt(formData.get('maxBranches') as string || '0', 10);
  if (!Number.isInteger(maxBranches) || maxBranches < 1) {
    return { error: 'الحد الأقصى للفروع يجب أن يكون رقماً صحيحاً موجباً' };
  }

  const currentBranchCount = await db.branch.count();
  if (maxBranches < currentBranchCount) {
    return { error: `لا يمكن خفض الحد عن عدد الفروع الحالي (${currentBranchCount})` };
  }

  const brand = await db.brandSettings.findFirst();
  const savedBrand = brand
    ? await db.brandSettings.update({
        where: { id: brand.id },
        data: { maxBranches },
      })
    : await db.brandSettings.create({
        data: {
          id: 'default-brand',
          maxBranches,
          brandNameAr: 'بريق',
          brandNameEn: 'Bareeq',
        },
      });

  await logAudit({
    actorUserId: admin.id,
    actorRole: admin.role,
    action: 'UPDATE_MAX_BRANCHES',
    entityType: 'BrandSettings',
    entityId: savedBrand.id,
    beforeJson: { maxBranches: brand?.maxBranches ?? null },
    afterJson: { maxBranches },
  });

  revalidatePath('/system-admin');
  return { success: true };
}

export async function toggleUserActiveStatusAction(formData: FormData) {
  const admin = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);

  const userId = (formData.get('userId') as string || '').trim();
  if (!userId) return { error: 'معرف المستخدم غير محدد' };
  if (userId === admin.id) return { error: 'لا يمكنك تعطيل جلسة مدير النظام الحالية' };

  const targetUser = await db.user.findUnique({ where: { id: userId } });
  if (!targetUser) return { error: 'المستخدم غير موجود' };
  if (targetUser.role === UserRole.SYSTEM_SUPER_ADMIN) {
    return { error: 'حسابات مديري النظام لا تُدار من إجراء تفعيل المستخدمين العام' };
  }

  const newStatus = !targetUser.active;
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        active: newStatus,
        ...(newStatus ? { deletedAt: null } : {}),
      },
    });
    await revokeAllUserSessionsAndBumpVersion(
      tx,
      userId,
      newStatus ? 'ACCOUNT_ENABLED' : 'ACCOUNT_DISABLED'
    );
  });

  await logAudit({
    actorUserId: admin.id,
    actorRole: admin.role,
    action: newStatus ? 'ENABLE_USER' : 'DISABLE_USER',
    entityType: 'User',
    entityId: userId,
    beforeJson: { active: targetUser.active, role: targetUser.role },
    afterJson: { active: newStatus, role: targetUser.role },
  });

  revalidatePath('/system-admin');
  return { success: true };
}

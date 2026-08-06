'use server';

import { Prisma, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAccessibleBranchIds } from '@/lib/auth/authorization';
import { requireRole } from '@/lib/auth/session';
import { revokeAllUserSessionsAndBumpVersion } from '@/lib/auth/session-store';
import { db } from '@/lib/db';
import { clearLockout } from '@/lib/security/rate-limit';
import { logSecurityEvent } from '@/lib/security/security-events';
import { databaseIdSchema } from '@/lib/validations/database-id';
import { isCanonicalPhone, normalizePhone } from '@/lib/validations/phone';

export interface PasswordResetAdminResult {
  success?: true;
  error?: string;
}

const requestIdSchema = databaseIdSchema;
const reasonSchema = z.string().trim().min(5, 'دوّن طريقة التحقق أو سبب الرفض بوضوح.').max(1000);
const temporaryPasswordSchema = z.string()
  .min(14, 'كلمة المرور المؤقتة يجب أن تكون 14 حرفًا على الأقل.')
  .max(128)
  .regex(/[a-z]/, 'أضف حرفًا إنجليزيًا صغيرًا.')
  .regex(/[A-Z]/, 'أضف حرفًا إنجليزيًا كبيرًا.')
  .regex(/\d/, 'أضف رقمًا.')
  .regex(/[^A-Za-z0-9]/, 'أضف رمزًا خاصًا.')
  .refine((value) => !/password|change-?me|replace-?me|bareeq123|admin/i.test(value), {
    message: 'اختر كلمة مؤقتة غير متوقعة ولا تستخدم قيمة افتراضية.',
  });

const RESET_MANAGER_ROLES = [
  UserRole.OPERATIONS_MANAGER,
  UserRole.OWNER,
  UserRole.SYSTEM_SUPER_ADMIN,
] as const;

async function loadAuthorizedRequest(
  actor: { id: string; role: UserRole },
  requestId: string,
) {
  const request = await db.passwordResetRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      userId: true,
      targetUser: {
        select: {
          phone: true,
          active: true,
          deletedAt: true,
          role: true,
          customerProfile: {
            select: { bookings: { select: { branchId: true }, take: 200 } },
          },
        },
      },
    },
  });
  if (!request) return null;
  if (request.targetUser.role !== UserRole.CUSTOMER) return null;

  if (actor.role === UserRole.OPERATIONS_MANAGER) {
    const accessibleBranchIds = await getAccessibleBranchIds(actor);
    const customerBranchIds = new Set(
      request.targetUser.customerProfile?.bookings.map(({ branchId }) => branchId) ?? [],
    );
    if (!accessibleBranchIds?.some((branchId) => customerBranchIds.has(branchId))) return null;
  }
  return request;
}

export async function resolvePasswordResetRequestAction(
  formData: FormData,
): Promise<PasswordResetAdminResult> {
  const actor = await requireRole([...RESET_MANAGER_ROLES]);
  const requestId = requestIdSchema.safeParse(formData.get('requestId'));
  const reason = reasonSchema.safeParse(formData.get('verificationReason'));
  const temporaryPassword = temporaryPasswordSchema.safeParse(formData.get('temporaryPassword'));
  if (!requestId.success || !reason.success || !temporaryPassword.success) {
    return {
      error: requestId.error?.issues[0]?.message
        ?? reason.error?.issues[0]?.message
        ?? temporaryPassword.error?.issues[0]?.message
        ?? 'بيانات المعالجة غير مكتملة.',
    };
  }

  const scoped = await loadAuthorizedRequest(actor, requestId.data);
  if (!scoped) return { error: 'الطلب غير موجود أو خارج نطاق فروعك.' };
  if (!scoped.targetUser.active || scoped.targetUser.deletedAt) {
    return { error: 'لا يمكن إعادة تعيين كلمة مرور حساب غير نشط.' };
  }

  const passwordHash = await bcrypt.hash(temporaryPassword.data, 12);
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`password-reset-request:${scoped.id}`}))`;
      const current = await tx.passwordResetRequest.findUnique({
        where: { id: scoped.id },
        select: { status: true },
      });
      if (!current || current.status !== 'PENDING') {
        throw new Error('RESET_REQUEST_ALREADY_HANDLED');
      }

      await tx.user.update({
        where: { id: scoped.userId },
        data: { passwordHash, mustChangePwd: true },
      });
      await revokeAllUserSessionsAndBumpVersion(tx, scoped.userId, 'MANUAL_PASSWORD_RESET');
      await tx.passwordResetRequest.update({
        where: { id: scoped.id },
        data: {
          status: 'RESOLVED',
          tempPasswordHash: passwordHash,
          expiresAt: null,
          completedAt: new Date(),
          handledByUserId: actor.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'PASSWORD_RESET_RESOLVED',
          entityType: 'PasswordResetRequest',
          entityId: scoped.id,
          beforeJson: { status: 'PENDING' },
          afterJson: { status: 'RESOLVED', targetUserId: scoped.userId, mustChangePwd: true },
          reason: reason.data,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Error && error.message === 'RESET_REQUEST_ALREADY_HANDLED') {
      return { error: 'تمت معالجة هذا الطلب بالفعل.' };
    }
    console.error('Password reset resolution failed', error);
    return { error: 'تعذر حفظ إعادة التعيين الآن. حاول مرة أخرى.' };
  }

  const normalizedPhone = normalizePhone(scoped.targetUser.phone);
  await Promise.all([
    clearLockout(isCanonicalPhone(normalizedPhone) ? normalizedPhone : scoped.targetUser.phone),
    logSecurityEvent({
      userId: scoped.userId,
      eventType: 'PASSWORD_CHANGED',
      description: 'A manual password-reset request was resolved by an authorized manager.',
      metadata: { requestId: scoped.id, handledByUserId: actor.id },
    }),
  ]);
  revalidatePath('/operations/password-resets');
  return { success: true };
}

export async function rejectPasswordResetRequestAction(
  formData: FormData,
): Promise<PasswordResetAdminResult> {
  const actor = await requireRole([...RESET_MANAGER_ROLES]);
  const requestId = requestIdSchema.safeParse(formData.get('requestId'));
  const reason = reasonSchema.safeParse(formData.get('verificationReason'));
  if (!requestId.success || !reason.success) {
    return { error: requestId.error?.issues[0]?.message ?? reason.error?.issues[0]?.message ?? 'السبب مطلوب.' };
  }
  const scoped = await loadAuthorizedRequest(actor, requestId.data);
  if (!scoped) return { error: 'الطلب غير موجود أو خارج نطاق فروعك.' };

  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`password-reset-request:${scoped.id}`}))`;
      const updated = await tx.passwordResetRequest.updateMany({
        where: { id: scoped.id, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          completedAt: new Date(),
          handledByUserId: actor.id,
          tempPasswordHash: null,
          expiresAt: null,
        },
      });
      if (updated.count !== 1) throw new Error('RESET_REQUEST_ALREADY_HANDLED');
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'PASSWORD_RESET_REJECTED',
          entityType: 'PasswordResetRequest',
          entityId: scoped.id,
          beforeJson: { status: 'PENDING' },
          afterJson: { status: 'REJECTED', targetUserId: scoped.userId },
          reason: reason.data,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Error && error.message === 'RESET_REQUEST_ALREADY_HANDLED') {
      return { error: 'تمت معالجة هذا الطلب بالفعل.' };
    }
    console.error('Password reset rejection failed', error);
    return { error: 'تعذر رفض الطلب الآن. حاول مرة أخرى.' };
  }
  revalidatePath('/operations/password-resets');
  return { success: true };
}

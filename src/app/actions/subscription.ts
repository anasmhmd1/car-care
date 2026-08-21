'use server';

import { Prisma, SubscriptionPaymentProofStatus, UserRole } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { canAccessBranch } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import {
  SubscriptionEngineError,
  activateCustomerSubscription,
  adjustCustomerSubscriptionVisits,
  cancelCustomerSubscription,
  decideSubscriptionPaymentProofStatus,
  extendCustomerSubscription,
  freezeCustomerSubscription,
  purchaseCustomerSubscription,
  unfreezeCustomerSubscription,
} from '@/lib/engine/subscription';
import { databaseIdSchema } from '@/lib/validations/database-id';

export type SubscriptionActionResult = {
  success?: boolean;
  error?: string;
  subscriptionId?: string;
  proofStatus?: SubscriptionPaymentProofStatus;
};

const idempotencyKeySchema = z.string().uuid('مفتاح العملية غير صالح.');
const reasonSchema = z.string().trim().min(3, 'اكتب سببًا واضحًا.').max(1000);
const purchaseSchema = z.object({
  planId: databaseIdSchema,
  vehicleIds: z.array(databaseIdSchema).min(1, 'اختر سيارة واحدة على الأقل.'),
  idempotencyKey: idempotencyKeySchema,
});
const reviewSubscriptionProofSchema = z.object({
  proofId: databaseIdSchema,
  decision: z.enum(['APPROVE', 'REJECT', 'REUPLOAD', 'DUPLICATE']),
  notes: reasonSchema,
});
const commandSchema = z.object({
  subscriptionId: databaseIdSchema,
  reason: reasonSchema,
  idempotencyKey: idempotencyKeySchema,
});
const freezeSchema = commandSchema.extend({
  freezeDays: z.coerce.number().int().min(1).max(365),
});
const extendSchema = commandSchema.extend({
  extensionDays: z.coerce.number().int().min(1).max(3650),
});
const adjustmentSchema = commandSchema.extend({
  adjustment: z.enum(['ADD', 'DEDUCT', 'RESTORE']),
  amount: z.coerce.number().int().min(1).max(10_000),
  serviceId: databaseIdSchema.optional(),
});

const SUBSCRIPTION_MANAGER_ROLES: UserRole[] = [
  UserRole.OPERATIONS_MANAGER,
  UserRole.OWNER,
  UserRole.SYSTEM_SUPER_ADMIN,
];

function actionError(error: unknown, fallback: string): SubscriptionActionResult {
  if (error instanceof SubscriptionEngineError) return { error: error.message };
  console.error('Subscription action failed:', error);
  return { error: fallback };
}

function isRetryableTransactionError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2034' || error.code === 'P2002');
}

async function runSerializable<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 25_000,
      });
    } catch (error) {
      lastError = error;
      if (!isRetryableTransactionError(error) || attempt === 2) throw error;
    }
  }
  throw lastError;
}

function revalidateSubscriptionPaths(subscriptionId?: string): void {
  revalidatePath('/plans');
  revalidatePath('/account');
  revalidatePath('/account/subscriptions');
  revalidatePath('/admin/subscriptions');
  revalidatePath('/admin/site');
  if (subscriptionId) revalidatePath(`/account/subscriptions/${subscriptionId}`);
}

async function requireManagedSubscription(
  actor: { id: string; role: UserRole },
  subscriptionId: string,
): Promise<{ hasDedicatedServiceBalances: boolean }> {
  const subscription = await db.customerSubscription.findUnique({
    where: { id: subscriptionId },
    select: {
      branchId: true,
      _count: { select: { serviceBalances: true } },
    },
  });
  if (!subscription) throw new SubscriptionEngineError('الاشتراك غير موجود.', 'SUBSCRIPTION_NOT_FOUND');
  if (!(await canAccessBranch(actor, subscription.branchId))) {
    throw new SubscriptionEngineError('لا تملك صلاحية إدارة اشتراكات هذا الفرع.', 'BRANCH_ACCESS_DENIED');
  }
  if (!(await hasPermission(actor, 'subscription.manage', { type: 'BRANCH', id: subscription.branchId }))) {
    throw new SubscriptionEngineError('لا تملك صلاحية إدارة الاشتراكات.', 'PERMISSION_DENIED');
  }
  return { hasDedicatedServiceBalances: subscription._count.serviceBalances > 0 };
}

export async function requestSubscriptionPurchaseAction(
  formData: FormData,
): Promise<SubscriptionActionResult> {
  const actor = await requireRole([UserRole.CUSTOMER]);
  const parsed = purchaseSchema.safeParse({
    planId: formData.get('planId'),
    vehicleIds: formData.getAll('vehicleIds'),
    idempotencyKey: formData.get('idempotencyKey'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات طلب الاشتراك غير مكتملة.' };
  }

  const customer = await db.customerProfile.findUnique({
    where: { userId: actor.id },
    select: { id: true },
  });
  if (!customer) return { error: 'ملف العميل غير موجود.' };

  try {
    const subscription = await runSerializable((tx) => purchaseCustomerSubscription(tx, {
      ...parsed.data,
      customerId: customer.id,
      userId: actor.id,
      role: actor.role,
      reason: 'طلب شراء اشتراك ودفعه يدويًا',
    }));
    revalidateSubscriptionPaths(subscription.id);
    return { success: true, subscriptionId: subscription.id };
  } catch (error) {
    return actionError(error, 'تعذر إنشاء طلب الاشتراك.');
  }
}

export async function reviewSubscriptionPaymentProofAction(
  formData: FormData,
): Promise<SubscriptionActionResult> {
  const actor = await requireRole(SUBSCRIPTION_MANAGER_ROLES);
  const parsed = reviewSubscriptionProofSchema.safeParse({
    proofId: formData.get('proofId'),
    decision: formData.get('decision'),
    notes: formData.get('notes') ?? formData.get('reason'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات مراجعة إثبات الدفع غير مكتملة.' };
  }

  const initial = await db.subscriptionPaymentProof.findUnique({
    where: { id: parsed.data.proofId },
    select: { subscriptionId: true },
  });
  if (!initial) return { error: 'إثبات الدفع غير موجود.' };

  try {
    await requireManagedSubscription(actor, initial.subscriptionId);
    const reviewed = await runSerializable(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`subscription-payment:${initial.subscriptionId}`}))`;
      const proof = await tx.subscriptionPaymentProof.findUnique({
        where: { id: parsed.data.proofId },
        include: {
          paymentMethod: { select: { branchId: true, active: true } },
          subscription: {
            select: {
              id: true,
              branchId: true,
              status: true,
              purchasePrice: true,
            },
          },
        },
      });
      if (!proof || proof.subscriptionId !== initial.subscriptionId) {
        throw new SubscriptionEngineError('إثبات الدفع غير موجود.', 'PAYMENT_PROOF_NOT_FOUND');
      }
      if (proof.status !== SubscriptionPaymentProofStatus.UNDER_REVIEW) {
        throw new SubscriptionEngineError('تمت مراجعة هذا الإثبات بالفعل.', 'PAYMENT_PROOF_ALREADY_REVIEWED');
      }
      if (proof.subscription.status !== 'PENDING_PAYMENT') {
        throw new SubscriptionEngineError('الاشتراك لم يعد بانتظار الدفع.', 'INVALID_STATUS');
      }
      if (
        proof.paymentMethod.branchId !== proof.subscription.branchId
        || !proof.paymentMethod.active
      ) {
        throw new SubscriptionEngineError('وسيلة الدفع لم تعد صالحة لهذا الفرع.', 'PAYMENT_METHOD_NOT_AVAILABLE');
      }

      const nextStatus = decideSubscriptionPaymentProofStatus(
        parsed.data.decision,
        proof.amountSubmitted,
        proof.subscription.purchasePrice,
      );

      if (nextStatus === SubscriptionPaymentProofStatus.APPROVED) {
        await tx.subscriptionPaymentProof.updateMany({
          where: {
            subscriptionId: proof.subscriptionId,
            id: { not: proof.id },
            status: SubscriptionPaymentProofStatus.APPROVED,
          },
          data: {
            status: SubscriptionPaymentProofStatus.REUPLOAD_REQUIRED,
            reviewNotes: 'استُبدل بإثبات أحدث معتمد.',
          },
        });
      }
      const updated = await tx.subscriptionPaymentProof.update({
        where: { id: proof.id },
        data: {
          status: nextStatus,
          reviewedByUserId: actor.id,
          reviewedAt: new Date(),
          reviewNotes: parsed.data.notes,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'SUBSCRIPTION_PAYMENT_PROOF_REVIEWED',
          entityType: 'SubscriptionPaymentProof',
          entityId: proof.id,
          beforeJson: { status: proof.status },
          afterJson: {
            status: nextStatus,
            subscriptionId: proof.subscriptionId,
            amountSubmitted: proof.amountSubmitted,
            expectedAmount: proof.subscription.purchasePrice,
          },
          reason: parsed.data.notes,
        },
      });
      return updated;
    });
    revalidateSubscriptionPaths(initial.subscriptionId);
    return {
      success: true,
      subscriptionId: initial.subscriptionId,
      proofStatus: reviewed.status,
    };
  } catch (error) {
    return actionError(error, 'تعذر مراجعة إثبات دفع الاشتراك.');
  }
}

export async function activateSubscriptionAction(
  formData: FormData,
): Promise<SubscriptionActionResult> {
  const actor = await requireRole(SUBSCRIPTION_MANAGER_ROLES);
  const parsed = commandSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات التفعيل غير مكتملة.' };

  try {
    await requireManagedSubscription(actor, parsed.data.subscriptionId);
    const subscription = await runSerializable(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`subscription-payment:${parsed.data.subscriptionId}`}))`;
      return activateCustomerSubscription(tx, {
        ...parsed.data,
        userId: actor.id,
        role: actor.role,
      });
    });
    revalidateSubscriptionPaths(subscription.id);
    return { success: true, subscriptionId: subscription.id };
  } catch (error) {
    return actionError(error, 'تعذر تفعيل الاشتراك.');
  }
}

export async function freezeSubscriptionAction(
  formData: FormData,
): Promise<SubscriptionActionResult> {
  const actor = await requireRole(SUBSCRIPTION_MANAGER_ROLES);
  const parsed = freezeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات التجميد غير مكتملة.' };

  try {
    await requireManagedSubscription(actor, parsed.data.subscriptionId);
    const subscription = await runSerializable((tx) => freezeCustomerSubscription(tx, {
      ...parsed.data,
      userId: actor.id,
      role: actor.role,
    }));
    revalidateSubscriptionPaths(subscription.id);
    return { success: true, subscriptionId: subscription.id };
  } catch (error) {
    return actionError(error, 'تعذر تجميد الاشتراك.');
  }
}

export async function unfreezeSubscriptionAction(
  formData: FormData,
): Promise<SubscriptionActionResult> {
  const actor = await requireRole(SUBSCRIPTION_MANAGER_ROLES);
  const parsed = commandSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات إلغاء التجميد غير مكتملة.' };

  try {
    await requireManagedSubscription(actor, parsed.data.subscriptionId);
    const subscription = await runSerializable((tx) => unfreezeCustomerSubscription(tx, {
      ...parsed.data,
      userId: actor.id,
      role: actor.role,
    }));
    revalidateSubscriptionPaths(subscription.id);
    return { success: true, subscriptionId: subscription.id };
  } catch (error) {
    return actionError(error, 'تعذر إلغاء تجميد الاشتراك.');
  }
}

export async function extendSubscriptionAction(
  formData: FormData,
): Promise<SubscriptionActionResult> {
  const actor = await requireRole(SUBSCRIPTION_MANAGER_ROLES);
  const parsed = extendSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات التمديد غير مكتملة.' };

  try {
    await requireManagedSubscription(actor, parsed.data.subscriptionId);
    const subscription = await runSerializable((tx) => extendCustomerSubscription(tx, {
      ...parsed.data,
      userId: actor.id,
      role: actor.role,
    }));
    revalidateSubscriptionPaths(subscription.id);
    return { success: true, subscriptionId: subscription.id };
  } catch (error) {
    return actionError(error, 'تعذر تمديد الاشتراك.');
  }
}

export async function cancelSubscriptionAction(
  formData: FormData,
): Promise<SubscriptionActionResult> {
  const actor = await requireRole(SUBSCRIPTION_MANAGER_ROLES);
  const parsed = commandSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات الإلغاء غير مكتملة.' };

  try {
    await requireManagedSubscription(actor, parsed.data.subscriptionId);
    const subscription = await runSerializable((tx) => cancelCustomerSubscription(tx, {
      ...parsed.data,
      userId: actor.id,
      role: actor.role,
    }));
    revalidateSubscriptionPaths(subscription.id);
    return { success: true, subscriptionId: subscription.id };
  } catch (error) {
    return actionError(error, 'تعذر إلغاء الاشتراك.');
  }
}

export async function adjustSubscriptionVisitsAction(
  formData: FormData,
): Promise<SubscriptionActionResult> {
  const actor = await requireRole(SUBSCRIPTION_MANAGER_ROLES);
  const parsed = adjustmentSchema.safeParse({
    ...Object.fromEntries(formData),
    serviceId: formData.get('serviceId') || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات تعديل الزيارات غير مكتملة.' };

  try {
    const management = await requireManagedSubscription(actor, parsed.data.subscriptionId);
    if (management.hasDedicatedServiceBalances && !parsed.data.serviceId) {
      return { error: 'اختر الخدمة المطلوب تعديل رصيدها في هذه الباقة الموزعة.' };
    }
    const result = await runSerializable((tx) => adjustCustomerSubscriptionVisits(tx, {
      ...parsed.data,
      userId: actor.id,
      role: actor.role,
    }));
    revalidateSubscriptionPaths(result.subscription.id);
    return { success: true, subscriptionId: result.subscription.id };
  } catch (error) {
    return actionError(error, 'تعذر تعديل رصيد الزيارات.');
  }
}

'use server';

import { Prisma, UserRole } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/session';
import { canAccessBranch } from '@/lib/auth/authorization';
import { hasPermissionAcrossScopes } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import {
  BookingAdministrationError,
  closeTerminalBookingReviewForOwner,
  closeBookingWithManagerOverride,
  reopenTerminalBookingForOwner,
} from '@/lib/engine/booking-administration';
import { SubscriptionEngineError } from '@/lib/engine/subscription';
import { BookingTransitionError } from '@/lib/engine/transition';
import { databaseIdSchema } from '@/lib/validations/database-id';

function administrationError(error: unknown, fallback: string): string {
  if (
    error instanceof BookingAdministrationError
    || error instanceof BookingTransitionError
    || error instanceof SubscriptionEngineError
  ) return error.message;
  if (
    error instanceof Prisma.PrismaClientKnownRequestError
    && ['P2002', 'P2034'].includes(error.code)
  ) {
    return 'تغيرت بيانات الحجز أثناء تنفيذ الإجراء. حدّث الصفحة وحاول مرة أخرى.';
  }
  console.error(fallback, error);
  return fallback;
}

function revalidateAdministrativeBooking(bookingId: string) {
  revalidatePath('/operations');
  revalidatePath('/admin');
  revalidatePath('/admin/calendar');
  revalidatePath('/staff');
  revalidatePath('/staff/delegated');
  revalidatePath(`/account/bookings/${bookingId}`);
}

export async function managerOverrideCloseBookingAction(formData: FormData) {
  const actor = await requireRole([
    UserRole.OPERATIONS_MANAGER,
    UserRole.OWNER,
  ]);
  const bookingId = String(formData.get('bookingId') ?? '');
  const rawReason = String(formData.get('reason') ?? '').trim();
  const reason = rawReason || 'إتمام وتسليم الحجز مباشرة كإجراء إداري من مدير التشغيل';
  if (!databaseIdSchema.safeParse(bookingId).success || reason.length < 3 || reason.length > 1000) {
    return { error: 'معرف الحجز وسبب الاستثناء الإداري مطلوبان.' };
  }

  const scopedBooking = await db.booking.findFirst({
    where: { id: bookingId, deletedAt: null },
    select: { branchId: true, assignedTeamId: true },
  });
  if (!scopedBooking) return { error: 'الحجز غير موجود.' };

  const scopes = [
    { type: 'BRANCH' as const, id: scopedBooking.branchId },
    ...(scopedBooking.assignedTeamId
      ? [{ type: 'TEAM' as const, id: scopedBooking.assignedTeamId }]
      : []),
  ];
  const [canOverride, canAccess] = await Promise.all([
    hasPermissionAcrossScopes(actor, 'booking.override_close', scopes),
    canAccessBranch(actor, scopedBooking.branchId),
  ]);
  if (!canOverride || !canAccess) {
    return { error: 'لا تملك صلاحية الاستثناء الإداري لهذا الحجز.' };
  }

  try {
    const result = await db.$transaction(
      (tx) => closeBookingWithManagerOverride(tx, {
        bookingId,
        actorUserId: actor.id,
        actorRole: actor.role,
        reason,
      }),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 25_000,
      },
    );
    revalidateAdministrativeBooking(bookingId);
    return { success: true, ...result };
  } catch (error) {
    return {
      error: administrationError(error, 'تعذر إغلاق الحجز بالاستثناء الإداري.'),
    };
  }
}

export async function reopenTerminalBookingAction(formData: FormData) {
  const owner = await requireRole([UserRole.OWNER]);
  const bookingId = String(formData.get('bookingId') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  if (!databaseIdSchema.safeParse(bookingId).success || reason.length < 3 || reason.length > 1000) {
    return { error: 'معرف الحجز وسبب إعادة الفتح مطلوبان.' };
  }

  try {
    const result = await db.$transaction(
      (tx) => reopenTerminalBookingForOwner(tx, {
        bookingId,
        actorUserId: owner.id,
        actorRole: owner.role,
        reason,
      }),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 20_000,
      },
    );
    revalidateAdministrativeBooking(bookingId);
    return { success: true, ...result };
  } catch (error) {
    return {
      error: administrationError(error, 'تعذر إعادة فتح الحجز للمراجعة الإدارية.'),
    };
  }
}

export async function closeTerminalBookingReviewAction(formData: FormData) {
  const owner = await requireRole([UserRole.OWNER]);
  const bookingId = String(formData.get('bookingId') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  if (!databaseIdSchema.safeParse(bookingId).success || reason.length < 3 || reason.length > 1000) {
    return { error: 'معرف الحجز وسبب إغلاق المراجعة مطلوبان.' };
  }

  try {
    const result = await db.$transaction(
      (tx) => closeTerminalBookingReviewForOwner(tx, {
        bookingId,
        actorUserId: owner.id,
        actorRole: owner.role,
        reason,
      }),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 20_000,
      },
    );
    revalidateAdministrativeBooking(bookingId);
    return { success: true, ...result };
  } catch (error) {
    return {
      error: administrationError(error, 'تعذر إغلاق مراجعة الحجز الطرفي.'),
    };
  }
}

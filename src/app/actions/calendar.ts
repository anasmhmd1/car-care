'use server';

import {
  BookingHoldStatus,
  BookingStatus,
  OperationalVehicleStatus,
  Prisma,
  TimeChangeStatus,
  UserRole,
} from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { canAccessBranch } from '@/lib/auth/authorization';
import {
  bookingPermissionScopes,
  hasPermissionAcrossScopes,
  resolvePermissionDecision,
  selectExplicitPermissionEffectForScopes,
} from '@/lib/auth/permissions';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { evaluateRequestedInterval } from '@/lib/engine/availability';
import { isCalendarReschedulableStatus } from '@/lib/engine/calendar';
import {
  dayOfWeekForLocalDate,
  localDateTimeToUtc,
} from '@/lib/engine/time';
import { databaseIdSchema } from '@/lib/validations/database-id';

const CALENDAR_ROLES = [
  UserRole.OPERATIONS_MANAGER,
  UserRole.OWNER,
  UserRole.SYSTEM_SUPER_ADMIN,
] as const;
const DEFAULT_RESCHEDULE_HOLD_MINUTES = 24 * 60;

const calendarRescheduleSchema = z.object({
  bookingId: databaseIdSchema,
  expectedStartAt: z.string().datetime({ offset: true }).transform((value) => new Date(value)),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'تاريخ الموعد الجديد غير صالح.'),
  targetTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'وقت الموعد الجديد غير صالح.'),
  reason: z.string().trim().min(5, 'اكتب سببًا واضحًا من 5 أحرف على الأقل.').max(500, 'السبب طويل جدًا.'),
});

class CalendarRescheduleError extends Error {}

function configuredHoldMinutes() {
  const value = Number(process.env.RESCHEDULE_HOLD_MINUTES);
  return Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_RESCHEDULE_HOLD_MINUTES;
}

function minutesFromTime(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function localDateTimeParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

function calendarErrorMessage(error: unknown) {
  if (error instanceof CalendarRescheduleError) return error.message;
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ['P2002', 'P2034'].includes(error.code)
  ) {
    return 'تغير الجدول أثناء الحفظ. حدّث التقويم وحاول مرة أخرى.';
  }
  console.error('Calendar reschedule failed', error);
  return 'تعذر حفظ الموعد الجديد. لم يتم تغيير الحجز.';
}

async function hasTransactionalBranchScope(
  tx: Prisma.TransactionClient,
  actor: { id: string; role: UserRole },
  branchId: string,
) {
  if (
    actor.role === UserRole.OWNER ||
    actor.role === UserRole.SYSTEM_SUPER_ADMIN
  ) {
    return true;
  }
  if (actor.role === UserRole.OPERATIONS_MANAGER) {
    return Boolean(await tx.branchMembership.findFirst({
      where: { branchId, userId: actor.id },
      select: { id: true },
    }));
  }
  return false;
}

async function hasTransactionalReschedulePermission(
  tx: Prisma.TransactionClient,
  actor: { id: string; role: UserRole },
  booking: { branchId: string; assignedTeamId: string | null },
) {
  const scopes = bookingPermissionScopes(booking);
  const [overrides, roleConfiguration] = await Promise.all([
    tx.userPermission.findMany({
      where: {
        userId: actor.id,
        permission: { code: 'booking.reschedule' },
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          { OR: [
            { scopeType: 'GLOBAL', scopeId: 'GLOBAL' },
            ...scopes.map((scope) => ({
              scopeType: scope.type,
              scopeId: scope.id,
            })),
          ] },
        ],
      },
      select: { effect: true, scopeType: true, scopeId: true, expiresAt: true },
    }),
    tx.role.findUnique({
      where: { code: actor.role },
      select: { permissions: true },
    }),
  ]);
  return resolvePermissionDecision({
    role: actor.role,
    permission: 'booking.reschedule',
    explicitEffect: selectExplicitPermissionEffectForScopes({
      overrides,
      scopes,
    }),
    configuredRolePermissions: roleConfiguration?.permissions,
  });
}

function revalidateCalendarPaths(bookingId: string) {
  revalidatePath('/admin/calendar');
  revalidatePath('/admin');
  revalidatePath('/operations');
  revalidatePath('/operations/resources');
  revalidatePath('/account/bookings');
  revalidatePath(`/account/bookings/${bookingId}`);
}

export async function rescheduleCalendarBookingAction(formData: FormData) {
  const actor = await requireRole([...CALENDAR_ROLES]);

  const parsed = calendarRescheduleSchema.safeParse({
    bookingId: formData.get('bookingId'),
    expectedStartAt: formData.get('expectedStartAt'),
    targetDate: formData.get('targetDate'),
    targetTime: formData.get('targetTime'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات الموعد الجديد غير مكتملة.' };
  }

  const scopedBooking = await db.booking.findFirst({
    where: { id: parsed.data.bookingId, deletedAt: null },
    select: { branchId: true, assignedTeamId: true },
  });
  if (!scopedBooking) return { error: 'الحجز غير موجود.' };
  if (!(await hasPermissionAcrossScopes(
    actor,
    'booking.reschedule',
    bookingPermissionScopes(scopedBooking),
  ))) {
    return { error: 'لا تملك صلاحية إعادة جدولة الحجوزات.' };
  }
  if (!(await canAccessBranch(actor, scopedBooking.branchId))) {
    return { error: 'غير مصرح لك بإدارة حجوزات هذا الفرع.' };
  }

  try {
    const result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking:${parsed.data.bookingId}`}))`;

      const booking = await tx.booking.findFirst({
        where: { id: parsed.data.bookingId, deletedAt: null },
        include: {
          branch: { include: { workingHours: true } },
          vehicle: { select: { vehicleSize: true } },
          addons: { select: { addonId: true } },
          timeChanges: {
            where: { status: TimeChangeStatus.PENDING },
            select: { id: true },
            take: 1,
          },
        },
      });
      if (!booking) throw new CalendarRescheduleError('الحجز غير موجود.');
      if (booking.startAt.getTime() !== parsed.data.expectedStartAt.getTime()) {
        throw new CalendarRescheduleError('تغير موعد الحجز منذ فتح التقويم. حدّث الصفحة قبل إعادة المحاولة.');
      }
      if (!(await hasTransactionalReschedulePermission(tx, actor, booking))) {
        throw new CalendarRescheduleError('تم سحب صلاحية إعادة الجدولة من حسابك. حدّث الصفحة.');
      }
      if (!(await hasTransactionalBranchScope(tx, actor, booking.branchId))) {
        throw new CalendarRescheduleError('انتهى نطاق وصولك لهذا الفرع. حدّث الصفحة.');
      }
      if (!isCalendarReschedulableStatus(booking.bookingStatus)) {
        throw new CalendarRescheduleError('حالة الحجز الحالية لا تسمح بتغيير الموعد من التقويم.');
      }
      if (booking.timeChanges.length > 0) {
        throw new CalendarRescheduleError('يوجد طلب تعديل موعد قيد المراجعة لهذا الحجز.');
      }

      const newStartAt = localDateTimeToUtc(
        parsed.data.targetDate,
        parsed.data.targetTime,
        booking.branch.timezone,
      );
      const resolvedLocalTime = localDateTimeParts(newStartAt, booking.branch.timezone);
      if (
        resolvedLocalTime.date !== parsed.data.targetDate ||
        resolvedLocalTime.time !== parsed.data.targetTime
      ) {
        throw new CalendarRescheduleError('هذا الوقت غير موجود محليًا بسبب تغيير التوقيت. اختر وقتًا آخر.');
      }
      const now = new Date();
      if (newStartAt <= now) {
        throw new CalendarRescheduleError('اختر موعدًا جديدًا في المستقبل.');
      }
      if (newStartAt.getTime() === booking.startAt.getTime()) {
        throw new CalendarRescheduleError('الموعد المختار هو الموعد الحالي نفسه.');
      }

      const workingHours = booking.branch.workingHours.find(
        ({ dayOfWeek }) => dayOfWeek === dayOfWeekForLocalDate(parsed.data.targetDate),
      );
      if (!workingHours || workingHours.isClosed) {
        throw new CalendarRescheduleError('الفرع مغلق في اليوم المختار.');
      }
      if (!Number.isInteger(booking.branch.slotUnitMinutes) || booking.branch.slotUnitMinutes <= 0) {
        throw new CalendarRescheduleError('إعداد وحدات مواعيد الفرع غير صالح. راجع إعدادات الفرع.');
      }
      const offsetFromOpening = minutesFromTime(parsed.data.targetTime) - minutesFromTime(workingHours.openTime);
      if (offsetFromOpening < 0 || offsetFromOpening % booking.branch.slotUnitMinutes !== 0) {
        throw new CalendarRescheduleError(`اختر وقتًا مطابقًا لوحدات الفرع (${booking.branch.slotUnitMinutes} دقيقة).`);
      }

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`capacity:${booking.branchId}`}))`;
      const availability = await evaluateRequestedInterval(tx, {
        branchId: booking.branchId,
        serviceId: booking.serviceId,
        coverageAreaId: booking.coverageAreaId,
        vehicleSize: booking.vehicle.vehicleSize,
        addonIds: booking.addons.map(({ addonId }) => addonId),
        startAt: newStartAt,
        excludeBookingId: booking.id,
        reservedDurationMinutes: booking.totalDurationMinutes,
      }, now);
      if (!availability) {
        throw new CalendarRescheduleError('الموعد يتعارض مع السعة أو الدوام أو الانتقال بين المناطق. اختر موعدًا آخر.');
      }
      if (
        booking.assignedTeamId &&
        !availability.feasibleTeamIds.includes(booking.assignedTeamId)
      ) {
        throw new CalendarRescheduleError('الفريق المسند غير متاح في الموعد الجديد. غيّر توزيع الفريق أولًا أو اختر وقتًا آخر.');
      }

      const newEndAt = new Date(
        newStartAt.getTime() + availability.totalDurationMinutes * 60_000,
      );

      if (booking.assignedEmployeeId || booking.operationalVehicleId) {
        const resourceLockKeys = [
          booking.assignedEmployeeId && `booking-resource:employee:${booking.assignedEmployeeId}`,
          booking.operationalVehicleId && `booking-resource:vehicle:${booking.operationalVehicleId}`,
        ].filter((key): key is string => Boolean(key));
        for (const key of [...new Set(resourceLockKeys)].sort()) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
        }
        const [assignedEmployee, assignedOperationalVehicle] = await Promise.all([
          booking.assignedEmployeeId
            ? tx.user.findFirst({
                where: {
                  id: booking.assignedEmployeeId,
                  role: UserRole.EMPLOYEE,
                  active: true,
                  deletedAt: null,
                  branchMemberships: { some: { branchId: booking.branchId } },
                  ...(booking.assignedTeamId
                    ? { teamMemberships: { some: { teamId: booking.assignedTeamId } } }
                    : {}),
                },
                select: { id: true },
              })
            : Promise.resolve(null),
          booking.operationalVehicleId
            ? tx.operationalVehicle.findFirst({
                where: {
                  id: booking.operationalVehicleId,
                  branchId: booking.branchId,
                  status: OperationalVehicleStatus.ACTIVE,
                  ...(booking.assignedTeamId
                    ? { OR: [{ teamId: null }, { teamId: booking.assignedTeamId }] }
                    : { teamId: null }),
                },
                select: { id: true },
              })
            : Promise.resolve(null),
        ]);
        if (booking.assignedEmployeeId && !assignedEmployee) {
          throw new CalendarRescheduleError(
            'الموظف المخصص لم يعد نشطًا أو لم يعد تابعًا لفريق الحجز. فك التخصيص أو حدّث الفريق أولًا.',
          );
        }
        if (booking.operationalVehicleId && !assignedOperationalVehicle) {
          throw new CalendarRescheduleError(
            'سيارة التشغيل المخصصة لم تعد نشطة أو لم تعد متاحة لفريق الحجز. فك التخصيص أو حدّث الفريق أولًا.',
          );
        }
        const resourceConflict = await tx.booking.findFirst({
          where: {
            id: { not: booking.id },
            deletedAt: null,
            bookingStatus: {
              notIn: [
                BookingStatus.CANCELLED,
                BookingStatus.REJECTED,
                BookingStatus.EXPIRED,
                BookingStatus.DELIVERED,
                BookingStatus.CLOSED,
              ],
            },
            OR: [
              ...(booking.assignedEmployeeId ? [{ assignedEmployeeId: booking.assignedEmployeeId }] : []),
              ...(booking.operationalVehicleId ? [{ operationalVehicleId: booking.operationalVehicleId }] : []),
            ],
            startAt: { lt: newEndAt },
            endAt: { gt: newStartAt },
          },
          select: { id: true },
        });
        if (resourceConflict) {
          throw new CalendarRescheduleError(
            'الموظف أو السيارة المسندين فرديًا لهذا الحجز في تعارض مع الموعد الجديد. قم بتعديل التخصيص الفردي أولًا أو اختر وقتًا آخر.',
          );
        }
      }
      const activeHolds = await tx.bookingHold.findMany({
        where: {
          bookingId: booking.id,
          status: BookingHoldStatus.ACTIVE,
          expiresAt: { gt: now },
        },
        select: { teamId: true },
      });
      await tx.bookingHold.updateMany({
        where: { bookingId: booking.id, status: BookingHoldStatus.ACTIVE },
        data: {
          status: BookingHoldStatus.RELEASED,
          releasedAt: now,
          releasedReason: 'إعادة جدولة من تقويم التشغيل',
        },
      });

      let reservedTeamId: string | null = null;
      if (!booking.assignedTeamId) {
        reservedTeamId = activeHolds.find(({ teamId }) =>
          availability.feasibleTeamIds.includes(teamId)
        )?.teamId ?? availability.feasibleTeamIds[0] ?? null;
        if (!reservedTeamId) {
          throw new CalendarRescheduleError('لم يعد هناك فريق متاح للموعد الجديد.');
        }
        await tx.bookingHold.create({
          data: {
            bookingId: booking.id,
            teamId: reservedTeamId,
            slotStartTime: newStartAt,
            slotEndTime: newEndAt,
            expiresAt: new Date(now.getTime() + configuredHoldMinutes() * 60_000),
            status: BookingHoldStatus.ACTIVE,
          },
        });
      }

      await tx.booking.update({
        where: { id: booking.id },
        data: {
          startAt: newStartAt,
          endAt: newEndAt,
          totalDurationMinutes: availability.totalDurationMinutes,
        },
      });
      const timeChange = await tx.bookingTimeChange.create({
        data: {
          bookingId: booking.id,
          oldStartAt: booking.startAt,
          oldEndAt: booking.endAt,
          requestedStartAt: newStartAt,
          requestedEndAt: newEndAt,
          status: TimeChangeStatus.APPROVED,
          requestedByUserId: actor.id,
          reviewedByUserId: actor.id,
          reason: parsed.data.reason,
          reviewNotes: 'اعتماد مباشر من تقويم التشغيل بعد فحص التعارض والسعة.',
          reviewedAt: now,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'BOOKING_CALENDAR_RESCHEDULED',
          entityType: 'Booking',
          entityId: booking.id,
          beforeJson: {
            startAt: booking.startAt.toISOString(),
            endAt: booking.endAt.toISOString(),
            bookingStatus: booking.bookingStatus,
            assignedTeamId: booking.assignedTeamId,
            assignedEmployeeId: booking.assignedEmployeeId,
            operationalVehicleId: booking.operationalVehicleId,
          },
          afterJson: {
            startAt: newStartAt.toISOString(),
            endAt: newEndAt.toISOString(),
            bookingStatus: booking.bookingStatus,
            assignedTeamId: booking.assignedTeamId,
            assignedEmployeeId: booking.assignedEmployeeId,
            operationalVehicleId: booking.operationalVehicleId,
            directResourcesRevalidated: Boolean(
              booking.assignedEmployeeId || booking.operationalVehicleId,
            ),
            reservedTeamId,
            timeChangeId: timeChange.id,
          },
          reason: parsed.data.reason,
        },
      });

      return {
        bookingId: booking.id,
        newStartAt: newStartAt.toISOString(),
        newEndAt: newEndAt.toISOString(),
      };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 25_000,
    });

    revalidateCalendarPaths(result.bookingId);
    return { success: true, ...result };
  } catch (error) {
    return { error: calendarErrorMessage(error) };
  }
}

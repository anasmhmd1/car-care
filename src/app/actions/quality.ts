'use server';

import {
  BookingStatus,
  ComplaintStatus,
  FileType,
  PaymentStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { syncInvoiceForBooking } from '@/lib/engine/invoice';
import { requireRole } from '@/lib/auth/session';
import { canAccessBranch } from '@/lib/auth/authorization';
import { canEmployeeAccessTaskAssignment } from '@/lib/auth/task-assignment';
import {
  bookingPermissionScopes,
  hasPermissionAcrossScopes,
} from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import {
  BookingTransitionError,
  transitionBookingStatus,
} from '@/lib/engine/transition';
import {
  createComplaintSchema,
  qualityReviewSchema,
  resolveComplaintSchema,
  triageComplaintSchema,
} from '@/lib/validations/operations';
import { databaseIdSchema } from '@/lib/validations/database-id';

const QUALITY_REVIEW_ROLES = [
  UserRole.OPERATIONS_MANAGER,
  UserRole.OWNER,
  UserRole.SYSTEM_SUPER_ADMIN,
  UserRole.EMPLOYEE,
] as const;
const COMPLAINT_MANAGEMENT_ROLES = [
  UserRole.OPERATIONS_MANAGER,
  UserRole.OWNER,
  UserRole.SYSTEM_SUPER_ADMIN,
] as const;

class QualityInputError extends Error {}

function qualityError(error: unknown, fallback: string) {
  if (error instanceof QualityInputError || error instanceof BookingTransitionError) {
    return error.message;
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ['P2002', 'P2034'].includes(error.code)
  ) return 'تغيرت البيانات أثناء تنفيذ الإجراء. حدّث الصفحة وحاول مرة أخرى.';
  console.error(fallback, error);
  return fallback;
}

async function assertBranchScope(
  actor: { id: string; role: UserRole },
  branchId: string,
) {
  if (!(await canAccessBranch(actor, branchId))) {
    throw new QualityInputError('غير مصرح لك بإدارة هذا الفرع.');
  }
}

function revalidateQuality(bookingId: string) {
  revalidatePath('/operations');
  revalidatePath('/admin');
  revalidatePath('/staff');
  revalidatePath('/staff/delegated');
  revalidatePath(`/account/bookings/${bookingId}`);
}

export async function reviewQualityAction(formData: FormData) {
  const reviewer = await requireRole([...QUALITY_REVIEW_ROLES]);
  const parsed = qualityReviewSchema.safeParse({
    bookingId: formData.get('bookingId'),
    approved: formData.get('approved'),
    score: formData.get('score') || undefined,
    notes: formData.get('notes') || '',
    returnedToTeam: formData.get('returnedToTeam') || 'false',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات مراجعة الجودة غير مكتملة.' };
  }

  const scoped = await db.booking.findFirst({
    where: { id: parsed.data.bookingId, deletedAt: null },
    select: { branchId: true, assignedTeamId: true },
  });
  if (!scoped) return { error: 'الحجز غير موجود.' };
  if (!(await hasPermissionAcrossScopes(
    reviewer,
    'quality.review',
    bookingPermissionScopes(scoped),
  ))) {
    return { error: 'لا تملك صلاحية اعتماد الجودة.' };
  }

  try {
    await assertBranchScope(reviewer, scoped.branchId);
    const result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`quality:${parsed.data.bookingId}`}))`;
      const booking = await tx.booking.findFirst({
        where: { id: parsed.data.bookingId, deletedAt: null },
      });
      if (!booking || booking.bookingStatus !== BookingStatus.QUALITY_REVIEW) {
        throw new QualityInputError('الحجز ليس في قائمة مراجعة الجودة الآن.');
      }

      const approved = parsed.data.approved && !parsed.data.returnedToTeam;
      const qualityReview = await tx.qualityReview.upsert({
        where: { bookingId: booking.id },
        create: {
          bookingId: booking.id,
          reviewedByUserId: reviewer.id,
          approved,
          score: parsed.data.score,
          notes: parsed.data.notes || null,
          returnedToTeam: !approved,
        },
        update: {
          reviewedByUserId: reviewer.id,
          approved,
          score: parsed.data.score,
          notes: parsed.data.notes || null,
          returnedToTeam: !approved,
          createdAt: new Date(),
        },
      });

      if (!approved) {
        await transitionBookingStatus(tx, {
          bookingId: booking.id,
          toStatus: BookingStatus.IN_SERVICE,
          actorUserId: reviewer.id,
          actorRole: reviewer.role,
          reason: parsed.data.notes,
          metadata: { qualityReviewId: qualityReview.id, returnedToTeam: true },
        });
        return { approved: false };
      }

      await transitionBookingStatus(tx, {
        bookingId: booking.id,
        toStatus: BookingStatus.SERVICE_COMPLETED,
        actorUserId: reviewer.id,
        actorRole: reviewer.role,
        reason: parsed.data.notes || 'اعتماد جودة الخدمة',
        metadata: { qualityReviewId: qualityReview.id, score: qualityReview.score },
      });
      return { approved: true };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 20_000,
    });

    revalidateQuality(parsed.data.bookingId);
    return { success: true, ...result };
  } catch (error) {
    return { error: qualityError(error, 'تعذر حفظ مراجعة الجودة.') };
  }
}

export async function advancePostServiceAction(formData: FormData) {
  const actor = await requireRole([
    UserRole.EMPLOYEE,
    UserRole.OPERATIONS_MANAGER,
    UserRole.OWNER,
  ]);
  const bookingId = String(formData.get('bookingId') ?? '');
  const target = String(formData.get('targetStatus') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  if (!databaseIdSchema.safeParse(bookingId).success || !['DELIVERED', 'CLOSED'].includes(target)) {
    return { error: 'بيانات إكمال الخدمة غير صالحة.' };
  }
  const targetStatus = target === 'DELIVERED'
    ? BookingStatus.DELIVERED
    : BookingStatus.CLOSED;

  const scopedBooking = await db.booking.findFirst({
    where: { id: bookingId, deletedAt: null },
    select: { branchId: true, assignedTeamId: true },
  });
  if (!scopedBooking) return { error: 'الحجز غير موجود.' };
  const scopedBookingPermissionScopes = bookingPermissionScopes(scopedBooking);
  if (targetStatus === BookingStatus.DELIVERED) {
    const canExecute = await hasPermissionAcrossScopes(
      actor,
      'task.execute',
      scopedBookingPermissionScopes,
    );
    if (!canExecute) {
      return { error: 'لا تملك صلاحية تنفيذ مهام هذا الفرع.' };
    }
  }
  if (targetStatus === BookingStatus.CLOSED) {
    const canClose = await hasPermissionAcrossScopes(
      actor,
      'booking.close',
      scopedBookingPermissionScopes,
    );
    if (!canClose || !(await canAccessBranch(actor, scopedBooking.branchId))) {
      return { error: 'لا تملك صلاحية الإغلاق النهائي لهذا الحجز.' };
    }
  }

  try {
    await db.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({
        where: { id: bookingId, deletedAt: null },
        include: {
          assignedTeam: {
            select: { members: { where: { userId: actor.id }, select: { id: true, isLeader: true } } },
          },
          branch: {
            select: { memberships: { where: { userId: actor.id }, select: { id: true } } },
          },
        },
      });
      if (!booking) throw new QualityInputError('الحجز غير موجود.');
      if (actor.role === UserRole.EMPLOYEE) {
        const teamMember = booking.assignedTeam?.members[0];
        const isTeamMember = Boolean(teamMember);
        if (!isTeamMember) {
          throw new QualityInputError('هذا الحجز غير مسند إلى فريقك.');
        }
        if (!canEmployeeAccessTaskAssignment({
          employeeId: actor.id,
          assignedEmployeeId: booking.assignedEmployeeId,
          isTeamMember,
          isTeamLeader: Boolean(teamMember?.isLeader),
        })) {
          throw new QualityInputError('هذا الحجز مخصص فرديًا لفني آخر داخل الفريق.');
        }
      }
      if (actor.role === UserRole.OPERATIONS_MANAGER && !booking.branch.memberships.length) {
        throw new QualityInputError('غير مصرح لك بإدارة هذا الفرع.');
      }
      if (booking.amountDue > 0) {
        const paymentAmount = booking.amountDue;
        const idempotencyKey = `auto-deliver-settle:${booking.id}:${Date.now()}`;
        await tx.payment.create({
          data: {
            bookingId: booking.id,
            idempotencyKey,
            amount: paymentAmount,
            paymentMethod: 'CASH',
            recordedByUserId: actor.id,
            notes: 'تحصيل كامل قيمة الخدمة عند اكتمال وتسليم الخدمة',
          },
        });
        const newAmountPaid = booking.totalPrice;
        await tx.booking.update({
          where: { id: booking.id },
          data: {
            amountPaid: newAmountPaid,
            amountDue: 0,
            paymentStatus: PaymentStatus.FULLY_PAID,
          },
        });
        await syncInvoiceForBooking(tx, {
          ...booking,
          amountPaid: newAmountPaid,
          amountDue: 0,
        }, actor.id);
      }

      await transitionBookingStatus(tx, {
        bookingId,
        toStatus: targetStatus,
        actorUserId: actor.id,
        actorRole: actor.role,
        reason: reason || (targetStatus === BookingStatus.DELIVERED ? 'تأكيد تسليم الخدمة وتحصيل كامل القيمة' : 'إغلاق الحجز بعد التسوية الكاملة'),
      });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 25_000,
    });
    revalidateQuality(bookingId);
    return { success: true };
  } catch (error) {
    return { error: qualityError(error, 'تعذر تحديث مرحلة التسليم.') };
  }
}

export async function createComplaintAction(formData: FormData) {
  const customer = await requireRole([UserRole.CUSTOMER]);
  const parsed = createComplaintSchema.safeParse({
    bookingId: formData.get('bookingId'),
    type: formData.get('type'),
    description: formData.get('description'),
    evidenceFileIds: formData.get('evidenceFileIds') || '[]',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات الشكوى غير مكتملة.' };
  }

  try {
    const complaint = await db.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({
        where: {
          id: parsed.data.bookingId,
          deletedAt: null,
          customer: { userId: customer.id },
        },
      });
      if (!booking) throw new QualityInputError('الحجز غير موجود أو لا يخص حسابك.');
      if (parsed.data.evidenceFileIds.length) {
        const evidenceCount = await tx.bookingFile.count({
          where: {
            id: { in: parsed.data.evidenceFileIds },
            bookingId: booking.id,
            uploadedByUserId: customer.id,
            fileType: FileType.COMPLAINT_EVIDENCE,
          },
        });
        if (evidenceCount !== parsed.data.evidenceFileIds.length) {
          throw new QualityInputError('أحد ملفات إثبات الشكوى غير صالح.');
        }
      }
      const created = await tx.complaint.create({
        data: {
          bookingId: booking.id,
          customerId: booking.customerId,
          type: parsed.data.type,
          description: parsed.data.description,
          priority: 'MEDIUM',
          status: ComplaintStatus.OPEN,
        },
      });
      if (parsed.data.evidenceFileIds.length) {
        await tx.complaintEvidence.createMany({
          data: parsed.data.evidenceFileIds.map((fileId) => ({
            complaintId: created.id,
            fileId,
          })),
        });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: customer.id,
          actorRole: customer.role,
          action: 'COMPLAINT_CREATED',
          entityType: 'Complaint',
          entityId: created.id,
          afterJson: {
            bookingId: booking.id,
            type: created.type,
            evidenceFileIds: parsed.data.evidenceFileIds,
          },
        },
      });
      return created;
    });
    revalidateQuality(parsed.data.bookingId);
    return { success: true, complaintId: complaint.id };
  } catch (error) {
    return { error: qualityError(error, 'تعذر إرسال الشكوى.') };
  }
}

export async function triageComplaintAction(formData: FormData) {
  const manager = await requireRole([...COMPLAINT_MANAGEMENT_ROLES]);
  const parsed = triageComplaintSchema.safeParse({
    complaintId: formData.get('complaintId'),
    priority: formData.get('priority'),
    status: formData.get('status'),
    assignedToUserId: formData.get('assignedToUserId') || undefined,
    notes: formData.get('notes'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات فرز الشكوى غير مكتملة.' };
  }
  const scoped = await db.complaint.findUnique({
    where: { id: parsed.data.complaintId },
    select: {
      bookingId: true,
      booking: { select: { branchId: true, assignedTeamId: true } },
    },
  });
  if (!scoped) return { error: 'الشكوى غير موجودة.' };
  if (!(await hasPermissionAcrossScopes(
    manager,
    'complaint.manage',
    bookingPermissionScopes(scoped.booking),
  ))) {
    return { error: 'لا تملك صلاحية إدارة الشكاوى.' };
  }

  try {
    await assertBranchScope(manager, scoped.booking.branchId);
    await db.$transaction(async (tx) => {
      if (parsed.data.assignedToUserId) {
        const assignee = await tx.user.findFirst({
          where: {
            id: parsed.data.assignedToUserId,
            active: true,
            deletedAt: null,
            OR: [
              { branchMemberships: { some: { branchId: scoped.booking.branchId } } },
              { teamMemberships: { some: { team: { branchId: scoped.booking.branchId } } } },
            ],
          },
        });
        if (!assignee) throw new QualityInputError('الموظف المسند لا يعمل في هذا الفرع.');
      }
      const before = await tx.complaint.findUnique({ where: { id: parsed.data.complaintId } });
      if (
        !before ||
        before.status === ComplaintStatus.CLOSED ||
        before.status === ComplaintStatus.RESOLVED
      ) {
        throw new QualityInputError('الشكوى مغلقة بالفعل.');
      }
      await tx.complaint.update({
        where: { id: before.id },
        data: {
          priority: parsed.data.priority,
          status: parsed.data.status,
          assignedToUserId: parsed.data.assignedToUserId ?? null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: manager.id,
          actorRole: manager.role,
          action: 'COMPLAINT_TRIAGED',
          entityType: 'Complaint',
          entityId: before.id,
          beforeJson: { status: before.status, priority: before.priority, assignedToUserId: before.assignedToUserId },
          afterJson: { status: parsed.data.status, priority: parsed.data.priority, assignedToUserId: parsed.data.assignedToUserId ?? null },
          reason: parsed.data.notes,
        },
      });
    });
    revalidateQuality(scoped.bookingId);
    return { success: true };
  } catch (error) {
    return { error: qualityError(error, 'تعذر فرز الشكوى.') };
  }
}

export async function resolveComplaintAction(formData: FormData) {
  const manager = await requireRole([...COMPLAINT_MANAGEMENT_ROLES]);
  const parsed = resolveComplaintSchema.safeParse({
    complaintId: formData.get('complaintId'),
    resolution: formData.get('resolution'),
    compensation: formData.get('compensation') || '',
    status: formData.get('status') || 'RESOLVED',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات حل الشكوى غير مكتملة.' };
  }
  const scoped = await db.complaint.findUnique({
    where: { id: parsed.data.complaintId },
    select: {
      bookingId: true,
      booking: { select: { branchId: true, assignedTeamId: true } },
    },
  });
  if (!scoped) return { error: 'الشكوى غير موجودة.' };
  if (!(await hasPermissionAcrossScopes(
    manager,
    'complaint.manage',
    bookingPermissionScopes(scoped.booking),
  ))) {
    return { error: 'لا تملك صلاحية إدارة الشكاوى.' };
  }

  try {
    await assertBranchScope(manager, scoped.booking.branchId);
    await db.$transaction(async (tx) => {
      const before = await tx.complaint.findUnique({ where: { id: parsed.data.complaintId } });
      if (!before || before.status === ComplaintStatus.CLOSED) {
        throw new QualityInputError('الشكوى مغلقة بالفعل.');
      }
      const resolution = [parsed.data.resolution, parsed.data.compensation && `التعويض: ${parsed.data.compensation}`]
        .filter(Boolean)
        .join('\n');
      await tx.complaint.update({
        where: { id: before.id },
        data: {
          status: parsed.data.status,
          resolution,
          resolvedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: manager.id,
          actorRole: manager.role,
          action: 'COMPLAINT_RESOLVED',
          entityType: 'Complaint',
          entityId: before.id,
          beforeJson: { status: before.status },
          afterJson: { status: parsed.data.status, compensation: parsed.data.compensation || null },
          reason: parsed.data.resolution,
        },
      });
    });
    revalidateQuality(scoped.bookingId);
    return { success: true };
  } catch (error) {
    return { error: qualityError(error, 'تعذر حل الشكوى.') };
  }
}

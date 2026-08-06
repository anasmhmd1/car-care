'use server';

import {
  BookingStatus,
  Prisma,
  SupportTicketStatus,
  UserRole,
} from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/lib/auth/session';
import { canAccessBranch } from '@/lib/auth/authorization';
import {
  bookingPermissionScopes,
  hasPermissionAcrossScopes,
} from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import { databaseIdSchema } from '@/lib/validations/database-id';

const ratingSchema = z.object({
  bookingId: databaseIdSchema,
  score: z.coerce.number().int().min(1, 'اختر تقييمًا من نجمة إلى خمس نجوم.').max(5),
  comment: z.string().trim().max(1_000, 'التعليق طويل جدًا.').optional(),
});

const createTicketSchema = z.object({
  bookingId: databaseIdSchema.optional(),
  subject: z.string().trim().min(3, 'اكتب عنوانًا أوضح للطلب.').max(160),
  category: z.string().trim().max(80).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  message: z.string().trim().min(3, 'اشرح المطلوب في ثلاث حروف على الأقل.').max(4_000),
});

const replyTicketSchema = z.object({
  ticketId: databaseIdSchema,
  message: z.string().trim().min(1, 'اكتب الرسالة أولًا.').max(4_000),
  isInternal: z.boolean().default(false),
});

const updateTicketSchema = z.object({
  ticketId: databaseIdSchema,
  status: z.nativeEnum(SupportTicketStatus),
  assignedToUserId: databaseIdSchema.optional(),
});

const moderateRatingSchema = z.object({
  ratingId: databaseIdSchema,
  approved: z.boolean(),
});

class CustomerExperienceError extends Error {}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof CustomerExperienceError) return error.message;
  if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
    return 'تغيرت البيانات أثناء الحفظ؛ حدّث الصفحة ثم أعد المحاولة.';
  }
  console.error(fallback, error);
  return fallback;
}

function revalidateCustomerExperience(bookingId?: string) {
  revalidatePath('/');
  revalidatePath('/account');
  revalidatePath('/account/support');
  revalidatePath('/account/invoices');
  revalidatePath('/admin');
  revalidatePath('/operations');
  if (bookingId) {
    revalidatePath(`/account/bookings/${bookingId}`);
    revalidatePath('/account/bookings');
  }
}

async function findCustomerProfile(userId: string) {
  const customer = await db.customerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!customer) throw new CustomerExperienceError('ملف العميل غير موجود.');
  return customer;
}

/** Customer-only evaluation for a completed service. Moderation is deliberately
 * separate, so an opinion can never be made public without owner approval. */
export async function submitCustomerRatingAction(formData: FormData) {
  const user = await requireRole([UserRole.CUSTOMER]);
  const parsed = ratingSchema.safeParse({
    bookingId: formData.get('bookingId'),
    score: formData.get('score'),
    comment: formData.get('comment') || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات التقييم غير صحيحة.' };

  try {
    const customer = await findCustomerProfile(user.id);
    const rating = await db.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({
        where: {
          id: parsed.data.bookingId,
          customerId: customer.id,
          deletedAt: null,
          bookingStatus: {
            in: [BookingStatus.SERVICE_COMPLETED, BookingStatus.DELIVERED, BookingStatus.CLOSED],
          },
        },
        select: { id: true, branchId: true, bookingNumber: true },
      });
      if (!booking) {
        throw new CustomerExperienceError('لا يمكن تقييم هذه الخدمة قبل اكتمالها أو لأنها لا تخص حسابك.');
      }

      const saved = await tx.customerServiceRating.upsert({
        where: { bookingId: booking.id },
        create: {
          bookingId: booking.id,
          customerId: customer.id,
          score: parsed.data.score,
          comment: parsed.data.comment || null,
        },
        update: {
          score: parsed.data.score,
          comment: parsed.data.comment || null,
          approvedForPublic: false,
          approvedByUserId: null,
          approvedAt: null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          actorRole: user.role,
          action: 'CUSTOMER_SERVICE_RATING_SUBMITTED',
          entityType: 'CustomerServiceRating',
          entityId: saved.id,
          afterJson: {
            bookingId: booking.id,
            branchId: booking.branchId,
            score: saved.score,
            publicApprovalReset: true,
          },
        },
      });
      return saved;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    revalidateCustomerExperience(parsed.data.bookingId);
    return { success: true, ratingId: rating.id, message: 'شكرًا لتقييمك. يظهر النشر العام بعد المراجعة.' };
  } catch (error) {
    return { error: errorMessage(error, 'تعذر حفظ تقييم الخدمة.') };
  }
}

export async function moderateCustomerRatingAction(formData: FormData) {
  const actor = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN, UserRole.OPERATIONS_MANAGER]);
  const parsed = moderateRatingSchema.safeParse({
    ratingId: formData.get('ratingId'),
    approved: formData.get('approved') === 'true' || formData.get('approved') === 'on',
  });
  if (!parsed.success) return { error: 'بيانات اعتماد التقييم غير صحيحة.' };

  try {
    const rating = await db.$transaction(async (tx) => {
      const current = await tx.customerServiceRating.findUnique({
        where: { id: parsed.data.ratingId },
        include: {
          booking: { select: { branchId: true, assignedTeamId: true } },
        },
      });
      if (!current) throw new CustomerExperienceError('التقييم غير موجود.');
      if (
        !(await canAccessBranch(actor, current.booking.branchId)) ||
        !(await hasPermissionAcrossScopes(
          actor,
          'quality.review',
          bookingPermissionScopes(current.booking),
        ))
      ) {
        throw new CustomerExperienceError('لا تملك صلاحية مراجعة اعتماد تقييمات هذا الفرع.');
      }
      const saved = await tx.customerServiceRating.update({
        where: { id: current.id },
        data: {
          approvedForPublic: parsed.data.approved,
          approvedByUserId: parsed.data.approved ? actor.id : null,
          approvedAt: parsed.data.approved ? new Date() : null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: parsed.data.approved ? 'CUSTOMER_RATING_PUBLISHED' : 'CUSTOMER_RATING_HIDDEN',
          entityType: 'CustomerServiceRating',
          entityId: saved.id,
          afterJson: { branchId: current.booking.branchId, approvedForPublic: saved.approvedForPublic },
        },
      });
      return saved;
    });
    revalidateCustomerExperience();
    return { success: true, approved: rating.approvedForPublic };
  } catch (error) {
    return { error: errorMessage(error, 'تعذر تحديث ظهور التقييم.') };
  }
}

export async function createSupportTicketAction(formData: FormData) {
  const user = await requireRole([UserRole.CUSTOMER]);
  const parsed = createTicketSchema.safeParse({
    bookingId: formData.get('bookingId') || undefined,
    subject: formData.get('subject'),
    category: formData.get('category') || undefined,
    priority: formData.get('priority') || 'NORMAL',
    message: formData.get('message'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات طلب الدعم غير صحيحة.' };

  try {
    const customer = await findCustomerProfile(user.id);
    const ticket = await db.$transaction(async (tx) => {
      const booking = parsed.data.bookingId
        ? await tx.booking.findFirst({
            where: { id: parsed.data.bookingId, customerId: customer.id, deletedAt: null },
            select: { id: true, branchId: true },
          })
        : null;
      if (parsed.data.bookingId && !booking) {
        throw new CustomerExperienceError('الحجز المحدد غير موجود أو لا يخص حسابك.');
      }
      const created = await tx.supportTicket.create({
        data: {
          customerId: customer.id,
          bookingId: booking?.id ?? null,
          branchId: booking?.branchId ?? null,
          subject: parsed.data.subject,
          category: parsed.data.category || null,
          priority: parsed.data.priority,
          messages: {
            create: { authorId: user.id, message: parsed.data.message, isInternal: false },
          },
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          actorRole: user.role,
          action: 'SUPPORT_TICKET_CREATED',
          entityType: 'SupportTicket',
          entityId: created.id,
          afterJson: { bookingId: booking?.id ?? null, branchId: booking?.branchId ?? null, priority: created.priority },
        },
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    revalidateCustomerExperience(parsed.data.bookingId);
    return { success: true, ticketId: ticket.id, message: 'تم إرسال طلب الدعم. سيتابع معك الفريق من داخل الحساب.' };
  } catch (error) {
    return { error: errorMessage(error, 'تعذر إرسال طلب الدعم.') };
  }
}

export async function replySupportTicketAction(formData: FormData) {
  const actor = await requireAuth();
  const parsed = replyTicketSchema.safeParse({
    ticketId: formData.get('ticketId'),
    message: formData.get('message'),
    isInternal: formData.get('isInternal') === 'true' || formData.get('isInternal') === 'on',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات الرسالة غير صحيحة.' };

  try {
    const ticket = await db.$transaction(async (tx) => {
      const current = await tx.supportTicket.findUnique({
        where: { id: parsed.data.ticketId },
        include: { customer: { select: { userId: true } } },
      });
      if (!current) throw new CustomerExperienceError('طلب الدعم غير موجود.');
      const customerReply = actor.role === UserRole.CUSTOMER;
      if (customerReply && current.customer.userId !== actor.id) {
        throw new CustomerExperienceError('لا يمكنك مراسلة طلب دعم لا يخص حسابك.');
      }
      if (
        !customerReply
        && actor.role !== UserRole.OWNER
        && actor.role !== UserRole.SYSTEM_SUPER_ADMIN
        && actor.role !== UserRole.OPERATIONS_MANAGER
      ) {
        throw new CustomerExperienceError('لا تملك صلاحية الرد على طلبات الدعم.');
      }
      if (!customerReply && current.branchId && !(await canAccessBranch(actor, current.branchId))) {
        throw new CustomerExperienceError('لا تملك صلاحية الوصول إلى طلب هذا الفرع.');
      }
      const isInternal = customerReply ? false : parsed.data.isInternal;
      await tx.supportTicketMessage.create({
        data: { ticketId: current.id, authorId: actor.id, message: parsed.data.message, isInternal },
      });
      const nextStatus = customerReply
        ? SupportTicketStatus.OPEN
        : isInternal
          ? current.status
          : SupportTicketStatus.WAITING_CUSTOMER;
      const updated = await tx.supportTicket.update({
        where: { id: current.id },
        data: {
          status: nextStatus,
          assignedToUserId: customerReply ? current.assignedToUserId : (current.assignedToUserId ?? actor.id),
          resolvedAt: null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: isInternal ? 'SUPPORT_TICKET_INTERNAL_NOTE' : 'SUPPORT_TICKET_REPLIED',
          entityType: 'SupportTicket',
          entityId: current.id,
          afterJson: { branchId: current.branchId, status: updated.status, isInternal },
        },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    revalidateCustomerExperience(ticket.bookingId ?? undefined);
    return { success: true, status: ticket.status };
  } catch (error) {
    return { error: errorMessage(error, 'تعذر إرسال الرسالة.') };
  }
}

export async function updateSupportTicketAction(formData: FormData) {
  const actor = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN, UserRole.OPERATIONS_MANAGER]);
  const parsed = updateTicketSchema.safeParse({
    ticketId: formData.get('ticketId'),
    status: formData.get('status'),
    assignedToUserId: formData.get('assignedToUserId') || undefined,
  });
  if (!parsed.success) return { error: 'بيانات حالة طلب الدعم غير صحيحة.' };

  try {
    const ticket = await db.$transaction(async (tx) => {
      const current = await tx.supportTicket.findUnique({ where: { id: parsed.data.ticketId } });
      if (!current) throw new CustomerExperienceError('طلب الدعم غير موجود.');
      if (current.branchId && !(await canAccessBranch(actor, current.branchId))) {
        throw new CustomerExperienceError('لا تملك صلاحية إدارة طلب هذا الفرع.');
      }
      if (parsed.data.assignedToUserId) {
        const assignee = await tx.user.findFirst({
          where: { id: parsed.data.assignedToUserId, active: true, deletedAt: null },
          select: { id: true },
        });
        if (!assignee) throw new CustomerExperienceError('الموظف المحدد غير متاح.');
      }
      const saved = await tx.supportTicket.update({
        where: { id: current.id },
        data: {
          status: parsed.data.status,
          assignedToUserId: parsed.data.assignedToUserId ?? null,
          resolvedAt: (
            parsed.data.status === SupportTicketStatus.RESOLVED
            || parsed.data.status === SupportTicketStatus.CLOSED
          )
            ? new Date()
            : null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'SUPPORT_TICKET_STATUS_UPDATED',
          entityType: 'SupportTicket',
          entityId: saved.id,
          beforeJson: { status: current.status, assignedToUserId: current.assignedToUserId },
          afterJson: { branchId: current.branchId, status: saved.status, assignedToUserId: saved.assignedToUserId },
        },
      });
      return saved;
    });
    revalidateCustomerExperience(ticket.bookingId ?? undefined);
    return { success: true, status: ticket.status };
  } catch (error) {
    return { error: errorMessage(error, 'تعذر تحديث طلب الدعم.') };
  }
}

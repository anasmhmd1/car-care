import {
  BookingStatus,
  ChecklistStage,
  FileType,
  Prisma,
  UserRole,
} from '@prisma/client';
import {
  EXECUTION_CHECKLIST_STAGES,
  validateStatusTransition,
} from './state-machine';
import { completeSubscriptionVisitForBooking } from './subscription';
import { deductEmployeeMaterialsForCompletedBooking } from './inventory-consumption';

export class BookingTransitionError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'BookingTransitionError';
  }
}

export interface TransitionBookingInput {
  bookingId: string;
  toStatus: BookingStatus;
  actorUserId: string;
  actorRole: UserRole;
  reason?: string | null;
  metadata?: Prisma.InputJsonValue;
  /**
   * Bypasses only execution checklist/after-photo and quality-approval guards.
   * Role, reason, graph, assignment, payment, and closing-balance guards remain.
   */
  managerOverride?: boolean;
}

/**
 * Changes a booking state, history, and audit entry atomically. All server
 * actions should use this service instead of writing bookingStatus directly.
 */
export async function transitionBookingStatus(
  tx: Prisma.TransactionClient,
  input: TransitionBookingInput,
) {
  const booking = await tx.booking.findUnique({
    where: { id: input.bookingId },
    include: {
      service: {
        select: {
          nameAr: true,
          minimumBeforePhotos: true,
          minimumAfterPhotos: true,
          checklistTemplates: {
            select: {
              stage: true,
              items: {
                where: { active: true, required: true },
                select: { id: true, requiresPhoto: true, requiresNote: true },
              },
            },
          },
        },
      },
      files: {
        select: { fileType: true, mimeType: true },
      },
      checklistInstances: {
        where: { completedAt: { not: null } },
        select: {
          stage: true,
          completedAt: true,
          results: {
            select: { itemId: true, isChecked: true, photoUrl: true, note: true },
          },
        },
      },
      qualityReview: {
        select: { approved: true, returnedToTeam: true },
      },
      assignedTeam: {
        select: {
          name: true,
          leaderId: true,
          members: {
            select: { id: true, userId: true },
          },
        },
      },
      operationalVehicle: {
        select: {
          code: true,
          plateNumber: true,
        },
      },
    },
  });

  if (!booking || booking.deletedAt) {
    throw new BookingTransitionError('الحجز غير موجود.', 'BOOKING_NOT_FOUND');
  }

  const beforePhotoCount = booking.files.filter(
    (file) => file.fileType === FileType.BEFORE_SERVICE && file.mimeType.startsWith('image/'),
  ).length;
  const afterPhotoCount = booking.files.filter(
    (file) => file.fileType === FileType.AFTER_SERVICE && file.mimeType.startsWith('image/'),
  ).length;
  const completedChecklistStages = Object.values(ChecklistStage).filter((stage) => {
    const requiredItems = booking.service.checklistTemplates
      .filter((template) => template.stage === stage)
      .flatMap((template) => template.items);
    if (requiredItems.length === 0) return true;
    const instance = booking.checklistInstances.find((i) => i.stage === stage);
    if (!instance || !instance.completedAt) return false;
    const resultByItemId = new Map(instance.results.map((result) => [result.itemId, result]));
    return requiredItems.every((item) => {
      const result = resultByItemId.get(item.id);
      return Boolean(
        result?.isChecked &&
        (!item.requiresNote || result.note?.trim()),
      );
    });
  });
  const bypassedGuards: string[] = [];
  if (input.managerOverride && input.toStatus === BookingStatus.QUALITY_REVIEW) {
    const completedStageSet = new Set(completedChecklistStages);
    if (EXECUTION_CHECKLIST_STAGES.some((stage) => !completedStageSet.has(stage))) {
      bypassedGuards.push('REQUIRED_CHECKLIST_STAGES');
    }
  }
  if (
    input.managerOverride
    && input.toStatus === BookingStatus.SERVICE_COMPLETED
    && !(booking.qualityReview?.approved && !booking.qualityReview.returnedToTeam)
  ) {
    bypassedGuards.push('QUALITY_APPROVAL');
  }
  const validation = validateStatusTransition(booking.bookingStatus, input.toStatus, {
    actorRole: input.actorRole,
    managerOverride: input.managerOverride,
    terminalAdministrativeReview: Boolean(booking.terminalReopenSourceStatus),
    paymentStatus: booking.paymentStatus,
    reason: input.reason,
    hasAssignedTeam: Boolean(booking.assignedTeamId),
    actorBelongsToAssignedTeam: Boolean(
      input.actorRole !== UserRole.EMPLOYEE ||
      booking.assignedTeam?.leaderId === input.actorUserId ||
      booking.assignedEmployeeId === input.actorUserId ||
      booking.assignedTeam?.members.some((m) => m.userId === input.actorUserId)
    ),
    completedChecklistStages,
    beforePhotoCount,
    afterPhotoCount,
    minimumBeforePhotos: booking.service.minimumBeforePhotos,
    minimumAfterPhotos: booking.service.minimumAfterPhotos,
    qualityApproved: Boolean(booking.qualityReview?.approved && !booking.qualityReview.returnedToTeam),
    amountDue: booking.amountDue,
  });

  if (!validation.allowed) {
    throw new BookingTransitionError(
      validation.message ?? 'انتقال حالة الحجز غير مسموح.',
      validation.code ?? 'TRANSITION_BLOCKED',
    );
  }

  const updateResult = await tx.booking.updateMany({
    where: {
      id: booking.id,
      bookingStatus: booking.bookingStatus,
      deletedAt: null,
    },
    data: { bookingStatus: input.toStatus },
  });

  if (updateResult.count !== 1) {
    throw new BookingTransitionError('تغيرت حالة الحجز بالفعل؛ حدّث الصفحة وحاول مجددًا.', 'STALE_BOOKING_STATUS');
  }

  if (input.toStatus === BookingStatus.SERVICE_COMPLETED) {
    if (booking.subscriptionId) {
      await completeSubscriptionVisitForBooking(tx, {
        bookingId: booking.id,
        userId: input.actorUserId,
        role: input.actorRole,
        reason: 'خصم زيارة الاشتراك عند اكتمال الخدمة',
      });
    }

    await deductEmployeeMaterialsForCompletedBooking(tx, {
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      serviceId: booking.serviceId,
      serviceNameAr: booking.service.nameAr,
      branchId: booking.branchId,
      assignedEmployeeId: booking.assignedEmployeeId,
      assignedTeamMembers: booking.assignedTeam?.members.map((m) => m.userId) ?? [],
      teamLeaderId: booking.assignedTeam?.leaderId ?? null,
      teamName: booking.assignedTeam?.name ?? null,
      vehicleCode: booking.operationalVehicle?.code ?? null,
      vehiclePlateNumber: booking.operationalVehicle?.plateNumber ?? null,
      actorUserId: input.actorUserId,
    });
  }

  await tx.bookingStatusHistory.create({
    data: {
      bookingId: booking.id,
      fromStatus: booking.bookingStatus,
      toStatus: input.toStatus,
      changedByUserId: input.actorUserId,
      actorRole: input.actorRole,
      reason: input.reason?.trim() || null,
      metadata: input.metadata,
    },
  });

  await tx.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      action: 'BOOKING_STATUS_CHANGED',
      entityType: 'Booking',
      entityId: booking.id,
      beforeJson: { bookingStatus: booking.bookingStatus },
      afterJson: { bookingStatus: input.toStatus, metadata: input.metadata ?? null },
      reason: input.reason?.trim() || null,
    },
  });

  return {
    id: booking.id,
    fromStatus: booking.bookingStatus,
    toStatus: input.toStatus,
    bypassedGuards,
  };
}

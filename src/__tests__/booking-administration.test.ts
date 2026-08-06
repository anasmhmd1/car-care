import { describe, expect, it, vi } from 'vitest';
import { BookingStatus, PaymentStatus, Prisma, UserRole } from '@prisma/client';
import {
  closeTerminalBookingReviewForOwner,
  reopenTerminalBookingForOwner,
  TERMINAL_REOPEN_SOURCE_STATUSES,
  TERMINAL_REOPEN_TARGET_STATUS,
  validateManagerOverrideCloseRequest,
  validateTerminalReopenRequest,
} from '@/lib/engine/booking-administration';
import { validateStatusTransition } from '@/lib/engine/state-machine';

describe('booking administrative exceptions', () => {
  it('lets Operations Manager and Owner bypass only checklist/quality guards with a reason', () => {
    for (const actorRole of [UserRole.OPERATIONS_MANAGER, UserRole.OWNER]) {
      expect(validateManagerOverrideCloseRequest({
        actorRole,
        fromStatus: BookingStatus.IN_SERVICE,
        reason: 'تعذر استكمال توثيق قائمة الإغلاق',
        assignedTeamId: 'team-a',
        amountDue: 0,
      })).toEqual({ allowed: true });

      expect(validateStatusTransition(
        BookingStatus.IN_SERVICE,
        BookingStatus.QUALITY_REVIEW,
        {
          actorRole,
          managerOverride: true,
          reason: 'تعذر استكمال توثيق قائمة الإغلاق',
          hasAssignedTeam: true,
          completedChecklistStages: [],
          afterPhotoCount: 0,
          minimumAfterPhotos: 4,
        },
      )).toEqual({ allowed: true });

      expect(validateStatusTransition(
        BookingStatus.QUALITY_REVIEW,
        BookingStatus.SERVICE_COMPLETED,
        {
          actorRole,
          managerOverride: true,
          reason: 'اعتماد إغلاق إداري موثق',
          hasAssignedTeam: true,
          qualityApproved: false,
        },
      )).toEqual({ allowed: true });
    }
  });

  it('never lets Employee use or receive the manager override path', () => {
    expect(validateManagerOverrideCloseRequest({
      actorRole: UserRole.EMPLOYEE,
      fromStatus: BookingStatus.IN_SERVICE,
      reason: 'محاولة غير مصرح بها',
      assignedTeamId: 'team-a',
      amountDue: 0,
    })).toEqual({ allowed: false, code: 'ROLE_FORBIDDEN' });

    expect(validateStatusTransition(
      BookingStatus.QUALITY_REVIEW,
      BookingStatus.SERVICE_COMPLETED,
      {
        actorRole: UserRole.EMPLOYEE,
        managerOverride: true,
        reason: 'محاولة غير مصرح بها',
        hasAssignedTeam: true,
      },
    )).toMatchObject({ allowed: false, code: 'MANAGER_OVERRIDE_FORBIDDEN' });
  });

  it('keeps team and financial guards even when managerOverride is requested', () => {
    expect(validateManagerOverrideCloseRequest({
      actorRole: UserRole.OPERATIONS_MANAGER,
      fromStatus: BookingStatus.QUALITY_REVIEW,
      reason: 'إغلاق إداري',
      assignedTeamId: null,
      amountDue: 0,
    })).toEqual({ allowed: false, code: 'TEAM_NOT_ASSIGNED' });

    expect(validateManagerOverrideCloseRequest({
      actorRole: UserRole.OPERATIONS_MANAGER,
      fromStatus: BookingStatus.QUALITY_REVIEW,
      reason: 'إغلاق إداري',
      assignedTeamId: 'team-a',
      amountDue: 100,
    })).toEqual({ allowed: false, code: 'OUTSTANDING_BALANCE' });

    expect(validateStatusTransition(
      BookingStatus.DELIVERED,
      BookingStatus.CLOSED,
      {
        actorRole: UserRole.OPERATIONS_MANAGER,
        managerOverride: true,
        reason: 'إغلاق إداري',
        hasAssignedTeam: true,
        amountDue: 100,
      },
    )).toMatchObject({ allowed: false, code: 'OUTSTANDING_BALANCE' });
  });

  it('requires a non-blank manager override reason and an in-service source', () => {
    expect(validateManagerOverrideCloseRequest({
      actorRole: UserRole.OPERATIONS_MANAGER,
      fromStatus: BookingStatus.IN_SERVICE,
      reason: '  ',
      assignedTeamId: 'team-a',
      amountDue: 0,
    })).toEqual({ allowed: false, code: 'REASON_REQUIRED' });

    expect(validateManagerOverrideCloseRequest({
      actorRole: UserRole.OPERATIONS_MANAGER,
      fromStatus: BookingStatus.ARRIVED,
      reason: 'لم تبدأ الخدمة بعد',
      assignedTeamId: 'team-a',
      amountDue: 0,
    })).toEqual({ allowed: false, code: 'INVALID_SOURCE_STATUS' });
  });

  it('allows only Owner to reopen each specified terminal status into admin review', () => {
    expect(TERMINAL_REOPEN_TARGET_STATUS).toBe(BookingStatus.ADMIN_REVIEW_REQUIRED);
    for (const fromStatus of TERMINAL_REOPEN_SOURCE_STATUSES) {
      expect(validateTerminalReopenRequest({
        actorRole: UserRole.OWNER,
        fromStatus,
        reason: 'مراجعة إدارية مطلوبة',
      })).toEqual({ allowed: true });
    }

    for (const actorRole of [
      UserRole.OPERATIONS_MANAGER,
      UserRole.EMPLOYEE,
      UserRole.SYSTEM_SUPER_ADMIN,
      UserRole.CUSTOMER,
    ]) {
      expect(validateTerminalReopenRequest({
        actorRole,
        fromStatus: BookingStatus.CLOSED,
        reason: 'محاولة إعادة فتح',
      })).toEqual({ allowed: false, code: 'ROLE_FORBIDDEN' });
    }
  });

  it('rejects reopening an active booking or reopening without a reason', () => {
    expect(validateTerminalReopenRequest({
      actorRole: UserRole.OWNER,
      fromStatus: BookingStatus.DELIVERED,
      reason: 'ما زال الحجز نشطًا',
    })).toEqual({ allowed: false, code: 'INVALID_SOURCE_STATUS' });

    expect(validateTerminalReopenRequest({
      actorRole: UserRole.OWNER,
      fromStatus: BookingStatus.CLOSED,
      reason: '',
    })).toEqual({ allowed: false, code: 'REASON_REQUIRED' });
  });

  it('reopens into a marked review-only state while preserving financial and operational records', async () => {
    const updateBooking = vi.fn().mockResolvedValue({ count: 1 });
    const createHistory = vi.fn().mockResolvedValue({ id: 'history-1' });
    const createAudit = vi.fn().mockResolvedValue({ id: 'audit-1' });
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      booking: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'booking-1',
          branchId: 'branch-1',
          bookingStatus: BookingStatus.CLOSED,
          paymentStatus: PaymentStatus.FULLY_PAID,
          assignedTeamId: 'team-1',
          subscriptionId: 'subscription-1',
          amountPaid: 600,
          amountDue: 0,
          creditAppliedAmount: 100,
        }),
        updateMany: updateBooking,
      },
      refund: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'refund-1', amount: 50, status: 'REFUNDED' },
        ]),
      },
      bookingHold: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'hold-1', status: 'RELEASED' },
        ]),
      },
      subscriptionVisitLedger: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'ledger-1',
            action: 'BOOKING_COMPLETED',
            visitChange: -1,
            remainingAfter: 3,
          },
        ]),
      },
      bookingStatusHistory: { create: createHistory },
      auditLog: { create: createAudit },
    } as unknown as Prisma.TransactionClient;

    await reopenTerminalBookingForOwner(tx, {
      bookingId: 'booking-1',
      actorUserId: 'owner-1',
      actorRole: UserRole.OWNER,
      reason: 'فتح الحالة لمراجعة شكوى موثقة',
    });

    expect(updateBooking).toHaveBeenCalledOnce();
    expect(updateBooking).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        bookingStatus: BookingStatus.ADMIN_REVIEW_REQUIRED,
        terminalReopenSourceStatus: BookingStatus.CLOSED,
        terminalReopenedAt: expect.any(Date),
      }),
    }));
    expect(createHistory).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        fromStatus: BookingStatus.CLOSED,
        toStatus: BookingStatus.ADMIN_REVIEW_REQUIRED,
        reason: 'فتح الحالة لمراجعة شكوى موثقة',
      }),
    }));
    expect(createAudit).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'BOOKING_TERMINAL_REOPENED',
        beforeJson: expect.objectContaining({
          amountPaid: 600,
          refunds: [{ id: 'refund-1', amount: 50, status: 'REFUNDED' }],
          visitLedgerEntries: [expect.objectContaining({ visitChange: -1 })],
        }),
        afterJson: expect.objectContaining({
          financialSettlementPreserved: true,
          holdsPreservedWithoutReactivation: true,
          subscriptionLedgerPreserved: true,
        }),
      }),
    }));
  });

  it('blocks normal transitions during terminal review and closes it by restoring the exact source status', async () => {
    expect(validateStatusTransition(
      BookingStatus.ADMIN_REVIEW_REQUIRED,
      BookingStatus.ACCEPTED,
      {
        actorRole: UserRole.OWNER,
        terminalAdministrativeReview: true,
      },
    )).toMatchObject({ allowed: false, code: 'TERMINAL_REVIEW_ONLY' });

    const updateBooking = vi.fn().mockResolvedValue({ count: 1 });
    const createHistory = vi.fn().mockResolvedValue({ id: 'history-2' });
    const createAudit = vi.fn().mockResolvedValue({ id: 'audit-2' });
    const reopenedAt = new Date('2026-08-01T10:00:00.000Z');
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      booking: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'booking-2',
          branchId: 'branch-1',
          bookingStatus: BookingStatus.ADMIN_REVIEW_REQUIRED,
          terminalReopenSourceStatus: BookingStatus.CANCELLED,
          terminalReopenedAt: reopenedAt,
          paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
          assignedTeamId: 'team-1',
          subscriptionId: null,
          amountPaid: 400,
          amountDue: 0,
          creditAppliedAmount: 0,
        }),
        updateMany: updateBooking,
      },
      bookingStatusHistory: { create: createHistory },
      auditLog: { create: createAudit },
    } as unknown as Prisma.TransactionClient;

    await closeTerminalBookingReviewForOwner(tx, {
      bookingId: 'booking-2',
      actorUserId: 'owner-1',
      actorRole: UserRole.OWNER,
      reason: 'اكتملت المراجعة الإدارية الموثقة',
    });

    expect(updateBooking).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        bookingStatus: BookingStatus.ADMIN_REVIEW_REQUIRED,
        terminalReopenSourceStatus: BookingStatus.CANCELLED,
      }),
      data: {
        bookingStatus: BookingStatus.CANCELLED,
        terminalReopenSourceStatus: null,
        terminalReopenedAt: null,
      },
    }));
    expect(createHistory).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        fromStatus: BookingStatus.ADMIN_REVIEW_REQUIRED,
        toStatus: BookingStatus.CANCELLED,
      }),
    }));
    expect(createAudit).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'BOOKING_TERMINAL_REVIEW_CLOSED' }),
    }));
  });
});

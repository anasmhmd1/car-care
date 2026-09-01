import { expect, test } from '@playwright/test';
import {
  BookingStatus,
  PaymentStatus,
  SubscriptionStatus,
  UserRole,
  VisitLedgerAction,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  completeSubscriptionVisitForBooking,
  releaseSubscriptionVisitForBooking,
} from '../src/lib/engine/subscription';
import {
  createAcceptancePrisma,
  probeAcceptanceDatabase,
} from './support/acceptance';

test.describe.configure({ mode: 'serial' });

test.describe('Seed-backed acceptance evidence', () => {
  const prisma = createAcceptancePrisma();
  let unavailableReason: string | null = null;

  test.beforeAll(async () => {
    unavailableReason = await probeAcceptanceDatabase(prisma);
  });

  test.beforeEach(() => {
    test.skip(Boolean(unavailableReason), unavailableReason ?? undefined);
  });

  test.afterAll(async () => {
    await prisma?.$disconnect();
  });

  test('scenario 1: the seeded closed booking contains the full paid execution trail', async () => {
    const booking = await prisma!.booking.findUnique({
      where: { bookingNumber: 'BQ-2026-1006' },
      include: {
        service: true,
        assignments: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
        paymentProofs: true,
        payments: true,
        checklistInstances: { include: { results: true } },
        files: true,
        qualityReview: true,
      },
    });

    expect(booking, 'Run `npm run db:seed`: BQ-2026-1006 is required.').not.toBeNull();
    expect(booking!.bookingStatus).toBe(BookingStatus.CLOSED);
    expect(booking!.paymentStatus).toBe(PaymentStatus.FULLY_PAID);
    expect(booking!.amountDue).toBe(0);
    expect(booking!.payments.length).toBeGreaterThan(0);
    expect(booking!.paymentProofs.some((proof) => proof.status === 'VERIFIED')).toBe(true);
    expect(booking!.assignments.some((assignment) => assignment.status === 'ACTIVE')).toBe(true);

    const statusPath = booking!.statusHistory.length
      ? [booking!.statusHistory[0].fromStatus, ...booking!.statusHistory.map((entry) => entry.toStatus)]
      : [];
    expect(statusPath).toEqual([
      BookingStatus.REQUEST_SUBMITTED,
      BookingStatus.AWAITING_PAYMENT_PROOF,
      BookingStatus.PAYMENT_UNDER_REVIEW,
      BookingStatus.PAYMENT_VERIFIED,
      BookingStatus.AWAITING_OPERATIONS_REVIEW,
      BookingStatus.ACCEPTED,
      BookingStatus.ASSIGNED,
      BookingStatus.TEAM_ACKNOWLEDGED,
      BookingStatus.ON_THE_WAY,
      BookingStatus.ARRIVED,
      BookingStatus.IN_SERVICE,
      BookingStatus.QUALITY_REVIEW,
      BookingStatus.SERVICE_COMPLETED,
      BookingStatus.DELIVERED,
      BookingStatus.CLOSED,
    ]);

    expect(booking!.checklistInstances.length).toBeGreaterThanOrEqual(4);
    expect(booking!.checklistInstances.every((instance) => Boolean(instance.completedAt))).toBe(true);
    expect(booking!.checklistInstances.flatMap((instance) => instance.results).every((result) => result.isChecked)).toBe(true);
    expect(booking!.qualityReview).toMatchObject({ approved: true, returnedToTeam: false });
  });

  test('scenario 8: purchase, completion deduction, and pre-service cancellation keep an auditable balance', async () => {
    const actor = await prisma!.user.findFirst({ where: { role: UserRole.OWNER } });
    const seed = await prisma!.customerProfile.findFirst({
      where: { vehicles: { some: {} } },
      include: { vehicles: { take: 1 } },
    });
    const plan = await prisma!.subscriptionPlan.findFirst();
    const area = await prisma!.coverageArea.findFirst({
      where: { active: true, zone: { branch: { status: 'ACTIVE' } } },
      include: { zone: true },
    });
    const variant = await prisma!.serviceVariant.findFirst({ where: { service: { active: true } } });
    expect(actor && seed && plan && area && variant, 'Run `npm run db:seed`: subscription dependencies are required.').toBeTruthy();

    class RollbackAcceptance extends Error {}
    let assertionsCompleted = false;
    try {
      await prisma!.$transaction(async (tx) => {
        const subscription = await tx.customerSubscription.create({
          data: {
            id: randomUUID(),
            customerId: seed!.id,
            planId: plan!.id,
            branchId: area!.zone.branchId,
            purchasePrice: plan!.price,
            startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            totalVisits: 2,
            usedVisits: 0,
            remainingVisits: 2,
            status: SubscriptionStatus.ACTIVE,
          },
        });
        await tx.subscriptionVisitLedger.create({
          data: {
            subscriptionId: subscription.id,
            action: VisitLedgerAction.PURCHASE,
            visitChange: 2,
            balanceBefore: 0,
            remainingAfter: 2,
            idempotencyKey: `e2e-purchase-${randomUUID()}`,
            reason: 'Playwright acceptance purchase',
            adjustedByUserId: actor!.id,
          },
        });

        const createSubscriptionBooking = async (label: string) => tx.booking.create({
          data: {
            bookingNumber: `E2E-SUB-${label}-${randomUUID().slice(0, 8)}`,
            customerId: seed!.id,
            branchId: area!.zone.branchId,
            coverageAreaId: area!.id,
            vehicleId: seed!.vehicles[0].id,
            serviceId: variant!.serviceId,
            serviceVariantId: variant!.id,
            subscriptionId: subscription.id,
            startAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            endAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
            totalDurationMinutes: 60,
            basePrice: 0,
            addonPrice: 0,
            totalPrice: 0,
            depositAmount: 0,
            amountPaid: 0,
            amountDue: 0,
            paymentStatus: PaymentStatus.NOT_REQUIRED,
            bookingStatus: BookingStatus.ACCEPTED,
            addressSnapshot: { source: 'playwright-acceptance' },
            vehicleSnapshot: { source: 'playwright-acceptance' },
            serviceSnapshot: { source: 'playwright-acceptance' },
            contactSnapshot: { source: 'playwright-acceptance' },
          },
        });

        const cancelledBeforeExecution = await createSubscriptionBooking('CANCEL');
        await tx.subscriptionVisitLedger.create({
          data: {
            subscriptionId: subscription.id,
            bookingId: cancelledBeforeExecution.id,
            action: VisitLedgerAction.BOOKING_RESERVED,
            visitChange: 0,
            balanceBefore: 2,
            remainingAfter: 2,
            idempotencyKey: `e2e-reserved-${cancelledBeforeExecution.id}`,
            reason: 'Reserved without deduction',
          },
        });
        const cancelled = await releaseSubscriptionVisitForBooking(tx, {
          bookingId: cancelledBeforeExecution.id,
          userId: actor!.id,
          role: actor!.role,
        });
        expect(cancelled).toMatchObject({ applied: true, restored: false, remainingAfter: 2 });

        const completedBooking = await createSubscriptionBooking('COMPLETE');
        await tx.subscriptionVisitLedger.create({
          data: {
            subscriptionId: subscription.id,
            bookingId: completedBooking.id,
            action: VisitLedgerAction.BOOKING_RESERVED,
            visitChange: 0,
            balanceBefore: 2,
            remainingAfter: 2,
            idempotencyKey: `e2e-reserved-${completedBooking.id}`,
            reason: 'Reserved without deduction',
          },
        });
        const completed = await completeSubscriptionVisitForBooking(tx, {
          bookingId: completedBooking.id,
          userId: actor!.id,
          role: actor!.role,
        });
        expect(completed).toMatchObject({ applied: true, remainingAfter: 1 });
        const afterCompletion = await tx.customerSubscription.findUniqueOrThrow({
          where: { id: subscription.id },
        });
        expect(afterCompletion).toMatchObject({ usedVisits: 1, remainingVisits: 1 });

        const restored = await releaseSubscriptionVisitForBooking(tx, {
          bookingId: completedBooking.id,
          userId: actor!.id,
          role: actor!.role,
        });
        expect(restored).toMatchObject({ restored: true, remainingAfter: 2 });
        assertionsCompleted = true;
        throw new RollbackAcceptance();
      }, { timeout: 20_000 });
    } catch (error) {
      if (!(error instanceof RollbackAcceptance)) throw error;
    }
    expect(assertionsCompleted).toBe(true);
  });
});

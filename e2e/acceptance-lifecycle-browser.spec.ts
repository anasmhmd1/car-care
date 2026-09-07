import { expect, test, type BrowserContext } from '@playwright/test';
import {
  AssignmentMode,
  BookingHoldStatus,
  BookingStatus,
  ChecklistStage,
  PaymentStatus,
  ProofStatus,
  UserRole,
  VehicleSize,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { localDateTimeToUtc } from '../src/lib/engine/time';
import {
  authenticateContext,
  cleanupAcceptancePaymentRecords,
  cleanupAcceptanceUsers,
  createAcceptancePrisma,
  createAcceptanceUser,
  probeAcceptanceDatabase,
  sessionPrerequisite,
} from './support/acceptance';

test.describe.configure({ mode: 'serial' });

test.describe('Full booking lifecycle browser acceptance', () => {
  const prisma = createAcceptancePrisma();
  let unavailableReason: string | null = null;

  test.beforeAll(async () => {
    unavailableReason = (await probeAcceptanceDatabase(prisma)) || sessionPrerequisite();
  });

  test.beforeEach(() => {
    test.skip(Boolean(unavailableReason), unavailableReason ?? undefined);
  });

  test.afterAll(async () => {
    await prisma?.$disconnect();
  });

  test('scenario 1: manager review, assignment, technician execution, quality, settlement and customer result run through UI', async ({ browser }) => {
    test.setTimeout(360_000);
    const method = await prisma!.branchPaymentMethod.findFirst({
      where: { active: true, branch: { status: 'ACTIVE' } },
      include: { branch: { include: { workingHours: true } } },
    });
    const area = method
      ? await prisma!.coverageArea.findFirst({ where: { active: true, zone: { branchId: method.branchId } } })
      : null;
    expect(method && area, 'Run the seed before browser acceptance.').toBeTruthy();
    const cancellationPolicy = await prisma!.cancellationPolicy.findFirst({
      where: { active: true, isDefault: true },
    });
    expect(cancellationPolicy, 'Run the seed: an active default cancellation policy is required.').toBeTruthy();
    const openHours = method!.branch.workingHours.find((hours) => !hours.isClosed);
    expect(openHours, 'The seeded branch needs an open working day.').toBeTruthy();

    let serviceDate = '';
    for (let offset = 10; offset <= 24; offset += 1) {
      const candidate = new Date(Date.now() + offset * 24 * 60 * 60 * 1000);
      if (candidate.getUTCDay() === openHours!.dayOfWeek) {
        serviceDate = candidate.toISOString().slice(0, 10);
        break;
      }
    }
    expect(serviceDate, 'Could not find an open service day in the acceptance window.').not.toBe('');
    const startAt = localDateTimeToUtc(
      serviceDate,
      openHours!.breakEndTime || openHours!.openTime,
      method!.branch.timezone,
    );
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

    const nonce = randomUUID();
    const [customerUser, manager, technician] = await Promise.all([
      createAcceptanceUser(prisma!, UserRole.CUSTOMER, 'lifecycle-customer'),
      createAcceptanceUser(prisma!, UserRole.OPERATIONS_MANAGER, 'lifecycle-manager'),
      createAcceptanceUser(prisma!, UserRole.EMPLOYEE, 'lifecycle-technician'),
    ]);
    const customer = await prisma!.customerProfile.create({ data: { userId: customerUser.id } });
    const vehicle = await prisma!.vehicle.create({
      data: {
        customerId: customer.id,
        make: 'E2E',
        model: 'Lifecycle',
        year: 2026,
        color: 'Black',
        vehicleSize: VehicleSize.SEDAN,
        isDefault: true,
      },
    });
    await prisma!.branchMembership.create({ data: { branchId: method!.branchId, userId: manager.id } });

    const service = await prisma!.service.create({
      data: {
        cancellationPolicyId: cancellationPolicy!.id,
        nameAr: `رحلة قبول ${nonce.slice(0, 8)}`,
        nameEn: 'E2E Lifecycle',
        slug: `e2e-lifecycle-${nonce}`,
        shortDescriptionAr: 'خدمة مؤقتة لاختبار رحلة التنفيذ الكاملة.',
        fullDescriptionAr: 'خدمة مؤقتة لاختبار رحلة التنفيذ الكاملة.',
        coverImage: '/images/service-care.svg',
        basePrice: 1_000,
        durationMinutes: 60,
        requiredTeamSize: 1,
        requiresDeposit: true,
        depositType: 'FIXED',
        depositValue: 300,
        active: true,
        bookableOnline: true,
        variants: { create: { vehicleSize: VehicleSize.SEDAN, price: 1_000, durationMinutes: 60 } },
        branchServices: { create: { branchId: method!.branchId, active: true, bookableOnline: true } },
        checklistTemplates: {
          create: [
            ChecklistStage.TEAM_PREPARATION,
            ChecklistStage.ARRIVAL_INSPECTION,
            ChecklistStage.SERVICE_EXECUTION,
            ChecklistStage.CLOSING,
          ].map((stage, index) => ({
            stage,
            name: `E2E ${stage}`,
            items: {
              create: {
                labelAr: `بند قبول ${index + 1}`,
                required: true,
                displayOrder: 1,
              },
            },
          })),
        },
      },
      include: { variants: true, checklistTemplates: { include: { items: true } } },
    });
    const team = await prisma!.team.create({
      data: {
        branchId: method!.branchId,
        name: `E2E Lifecycle Team ${nonce.slice(0, 8)}`,
        active: true,
        dailyCapacity: 2,
        members: { create: { userId: technician.id, isLeader: true } },
        capabilities: { create: { serviceId: service.id } },
        teamZones: { create: { zoneId: area!.zoneId } },
      },
    });

    const bookingNumber = `E2E-LIFECYCLE-${nonce.slice(0, 8).toUpperCase()}`;
    const booking = await prisma!.booking.create({
      data: {
        bookingNumber,
        customerId: customer.id,
        branchId: method!.branchId,
        coverageAreaId: area!.id,
        vehicleId: vehicle.id,
        serviceId: service.id,
        serviceVariantId: service.variants[0].id,
        startAt,
        endAt,
        totalDurationMinutes: 60,
        basePrice: 1_000,
        totalPrice: 1_000,
        depositAmount: 300,
        amountPaid: 0,
        amountDue: 1_000,
        paymentStatus: PaymentStatus.UNDER_REVIEW,
        bookingStatus: BookingStatus.PAYMENT_UNDER_REVIEW,
        assignmentMode: AssignmentMode.MANUAL,
        addressSnapshot: { compound: area!.compound, source: 'playwright-browser-lifecycle' },
        vehicleSnapshot: { make: 'E2E', model: 'Lifecycle', size: VehicleSize.SEDAN },
        serviceSnapshot: { nameAr: service.nameAr, slotCount: 1 },
        contactSnapshot: { name: customerUser.fullName, phone: '01000000111' },
        cancellationPolicyId: cancellationPolicy!.id,
        cancellationPolicySnapshot: {
          policyId: cancellationPolicy!.id,
          code: cancellationPolicy!.code,
          nameAr: cancellationPolicy!.nameAr,
          version: cancellationPolicy!.version,
          noticeHours: cancellationPolicy!.noticeHours,
          allowsCancellation: cancellationPolicy!.allowsCancellation,
          allowsRescheduling: cancellationPolicy!.allowsRescheduling,
          allowsLateRequests: cancellationPolicy!.allowsLateRequests,
          policyTextAr: cancellationPolicy!.policyTextAr,
        },
      },
    });
    await prisma!.bookingHold.create({
      data: {
        bookingId: booking.id,
        teamId: team.id,
        slotStartTime: startAt,
        slotEndTime: endAt,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        status: BookingHoldStatus.ACTIVE,
      },
    });
    await prisma!.paymentProof.create({
      data: {
        bookingId: booking.id,
        paymentMethodId: method!.id,
        senderName: customerUser.fullName,
        senderPhoneOrAccount: '01000000111',
        referenceNumber: `E2E-${nonce.slice(0, 8)}`,
        amountSubmitted: 300,
        transferTimestamp: new Date(Date.now() - 60_000),
        proofFileUrl: `/api/files/payment-proofs/e2e-${nonce}.png`,
        status: ProofStatus.UNDER_REVIEW,
        idempotencyKey: `e2e-lifecycle-proof-${nonce}`,
      },
    });

    const originalAssignmentMode = method!.branch.assignmentMode;
    await prisma!.branch.update({
      where: { id: method!.branchId },
      data: { assignmentMode: AssignmentMode.MANUAL },
    });
    const contexts: BrowserContext[] = [];
    try {
      const managerContext = await browser.newContext();
      contexts.push(managerContext);
      await authenticateContext(prisma!, managerContext, manager);
      const managerPage = await managerContext.newPage();
      await managerPage.goto('/operations', { waitUntil: 'domcontentloaded', timeout: 120_000 });

      const proofCard = managerPage.locator('article').filter({ hasText: bookingNumber });
      await proofCard.getByRole('button', { name: /مراجعة إثبات التحويل|فتح المراجعة/ }).click();
      await managerPage.getByRole('button', { name: 'اعتماد الإثبات' }).click();
      await expect.poll(async () => prisma!.booking.findUnique({
        where: { id: booking.id }, select: { bookingStatus: true, amountPaid: true },
      })).toEqual({ bookingStatus: BookingStatus.AWAITING_OPERATIONS_REVIEW, amountPaid: 300 });

      await managerPage.reload({ waitUntil: 'domcontentloaded' });
      await managerPage.waitForLoadState('networkidle').catch(() => {});
      await managerPage.getByRole('button', { name: /مراجعة التشغيل|مراجعة الحجوزات/ }).click();
      const reviewCard = managerPage.locator('article').filter({ hasText: bookingNumber });
      await expect(reviewCard).toBeVisible({ timeout: 30_000 });
      const reviewBtn = reviewCard.getByRole('button', { name: /مراجعة وقبول الحجز|اتخاذ القرار/ });
      await expect.poll(async () => {
        if (!await managerPage.getByRole('dialog').isVisible()) {
          await reviewBtn.click();
        }
        return managerPage.getByRole('dialog').isVisible();
      }, { timeout: 30_000 }).toBe(true);
      await managerPage.locator('#booking-review-reason').fill('قبول رحلة الاختبار الكاملة');
      await managerPage.getByRole('dialog').getByRole('button', { name: 'اعتماد وقبول' }).click();
      await expect.poll(async () => prisma!.booking.findUnique({
        where: { id: booking.id }, select: { bookingStatus: true },
      }), { timeout: 30_000 }).toEqual({ bookingStatus: BookingStatus.AWAITING_ASSIGNMENT });

      await managerPage.reload({ waitUntil: 'domcontentloaded' });
      await managerPage.waitForLoadState('networkidle').catch(() => {});
      await managerPage.getByRole('button', { name: /قائمة الإسناد/ }).click();
      const assignmentCard = managerPage.locator('article').filter({ hasText: bookingNumber });
      await expect(assignmentCard).toBeVisible({ timeout: 30_000 });
      const assignBtn = assignmentCard.getByRole('button', { name: /إسناد فريق/ });
      await expect.poll(async () => {
        if (!await managerPage.getByRole('dialog').isVisible()) {
          await assignBtn.click();
        }
        return managerPage.getByRole('dialog').isVisible();
      }, { timeout: 30_000 }).toBe(true);
      await managerPage.locator('#team-id').selectOption(team.id);
      await managerPage.locator('#assignment-reason').fill('إسناد فريق اختبار رحلة القبول');
      await managerPage.getByRole('button', { name: 'تأكيد الإسناد' }).click();
      await expect.poll(async () => prisma!.booking.findUnique({
        where: { id: booking.id }, select: { bookingStatus: true, assignedTeamId: true },
      }), { timeout: 30_000 }).toEqual({ bookingStatus: BookingStatus.ASSIGNED, assignedTeamId: team.id });

      const technicianContext = await browser.newContext();
      contexts.push(technicianContext);
      await authenticateContext(prisma!, technicianContext, technician);
      const technicianPage = await technicianContext.newPage();
      await technicianPage.goto(`/staff?section=tasks&taskId=${booking.id}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await expect(technicianPage.getByRole('heading', { name: bookingNumber })).toBeVisible({ timeout: 20_000 });

      const ackBtn = technicianPage.locator('[data-testid="workflow-TEAM_ACKNOWLEDGED"]');
      await expect(ackBtn).toBeEnabled({ timeout: 30_000 });
      await ackBtn.click();
      await expect.poll(async () => prisma!.booking.findUnique({
        where: { id: booking.id }, select: { bookingStatus: true },
      }), { timeout: 30_000 }).toEqual({ bookingStatus: BookingStatus.TEAM_ACKNOWLEDGED });

      for (const item of service.checklistTemplates
        .filter((template) => template.stage === ChecklistStage.TEAM_PREPARATION)
        .flatMap((template) => template.items)) {
        const control = technicianPage.getByRole('button', { name: item.labelAr }).last();
        await control.click();
      }

      const onTheWayBtn = technicianPage.locator('[data-testid="workflow-ON_THE_WAY"]');
      await expect(onTheWayBtn).toBeEnabled({ timeout: 30_000 });
      await onTheWayBtn.click();
      await expect.poll(async () => prisma!.booking.findUnique({
        where: { id: booking.id }, select: { bookingStatus: true },
      }), { timeout: 30_000 }).toEqual({ bookingStatus: BookingStatus.ON_THE_WAY });

      const arrivedBtn = technicianPage.locator('[data-testid="workflow-ARRIVED"]');
      await expect(arrivedBtn).toBeEnabled({ timeout: 30_000 });
      await arrivedBtn.click();
      await expect.poll(async () => prisma!.booking.findUnique({
        where: { id: booking.id }, select: { bookingStatus: true },
      }), { timeout: 30_000 }).toEqual({ bookingStatus: BookingStatus.ARRIVED });

      for (const item of service.checklistTemplates
        .filter((template) => template.stage === ChecklistStage.ARRIVAL_INSPECTION)
        .flatMap((template) => template.items)) {
        const control = technicianPage.getByRole('button', { name: item.labelAr }).last();
        await control.click();
      }

      const inServiceBtn = technicianPage.locator('[data-testid="workflow-IN_SERVICE"]');
      await expect(inServiceBtn).toBeEnabled({ timeout: 30_000 });
      await inServiceBtn.click();
      await expect.poll(async () => prisma!.booking.findUnique({
        where: { id: booking.id }, select: { bookingStatus: true },
      }), { timeout: 30_000 }).toEqual({ bookingStatus: BookingStatus.IN_SERVICE });

      for (const item of service.checklistTemplates
        .filter((template) => (
          template.stage === ChecklistStage.SERVICE_EXECUTION ||
          template.stage === ChecklistStage.CLOSING
        ))
        .flatMap((template) => template.items)) {
        const control = technicianPage.getByRole('button', { name: item.labelAr }).last();
        await control.click();
      }

      const qualityBtn = technicianPage.locator('[data-testid="workflow-QUALITY_REVIEW"]');
      await expect(qualityBtn).toBeEnabled({ timeout: 30_000 });
      await qualityBtn.click();
      await expect.poll(async () => prisma!.booking.findUnique({
        where: { id: booking.id }, select: { bookingStatus: true },
      }), { timeout: 30_000 }).toEqual({ bookingStatus: BookingStatus.QUALITY_REVIEW });

      await managerPage.goto('/operations', { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await managerPage.getByRole('button', { name: /مراجعة واعتماد الجودة/ }).click();
      const qualityCase = managerPage.locator('details').filter({ hasText: bookingNumber });
      await qualityCase.locator('summary').click();
      await qualityCase.locator('textarea[name="notes"]').fill('جودة التنفيذ مكتملة');
      await qualityCase.locator('button[name="approved"][value="true"]').click();
      await expect.poll(async () => prisma!.booking.findUnique({
        where: { id: booking.id }, select: { bookingStatus: true },
      }), { timeout: 30_000 }).toEqual({ bookingStatus: BookingStatus.SERVICE_COMPLETED });

      await managerPage.goto(`/operations?tab=bookings&bookingQuery=${bookingNumber}`, {
        waitUntil: 'domcontentloaded',
        timeout: 120_000,
      });
      await managerPage.waitForLoadState('networkidle').catch(() => {});
      const activeRow = managerPage.locator('article').filter({ hasText: bookingNumber });
      await expect(activeRow).toBeVisible({ timeout: 30_000 });
      const collectBtn = activeRow.getByRole('button', { name: /تحصيل/ });
      await expect.poll(async () => {
        if (!await managerPage.locator('#settlement-notes').isVisible()) {
          await collectBtn.click();
        }
        return managerPage.locator('#settlement-notes').isVisible();
      }, { timeout: 30_000 }).toBe(true);
      await managerPage.locator('#settlement-notes').fill('تحصيل الرصيد عند اكتمال الخدمة');
      await managerPage.getByRole('button', { name: /تأكيد تحصيل/ }).click();
      await expect.poll(async () => prisma!.booking.findUnique({
        where: { id: booking.id }, select: { amountDue: true, paymentStatus: true },
      }), { timeout: 30_000 }).toEqual({ amountDue: 0, paymentStatus: PaymentStatus.FULLY_PAID });

      await technicianPage.reload({ waitUntil: 'domcontentloaded' });
      const deliveredBtn = technicianPage.locator('[data-testid="workflow-DELIVERED"]');
      await expect(deliveredBtn).toBeEnabled({ timeout: 30_000 });
      await deliveredBtn.click();
      await expect.poll(async () => prisma!.booking.findUnique({
        where: { id: booking.id }, select: { bookingStatus: true },
      }), { timeout: 30_000 }).toEqual({ bookingStatus: BookingStatus.DELIVERED });

      await managerPage.goto(`/operations?tab=bookings&bookingQuery=${bookingNumber}`, {
        waitUntil: 'domcontentloaded',
        timeout: 120_000,
      });
      await managerPage.waitForLoadState('networkidle').catch(() => {});
      const deliveredRow = managerPage.locator('article').filter({ hasText: bookingNumber });
      await expect(deliveredRow).toBeVisible({ timeout: 30_000 });
      const closeBtn = deliveredRow.getByRole('button', { name: 'إغلاق الحجز' });
      await expect.poll(async () => {
        if (!await managerPage.locator('#close-reason').isVisible()) {
          await closeBtn.click();
        }
        return managerPage.locator('#close-reason').isVisible();
      }, { timeout: 30_000 }).toBe(true);
      await managerPage.locator('#close-reason').fill('إغلاق رحلة القبول بعد التسليم والسداد');
      await managerPage.getByRole('button', { name: 'تأكيد الإغلاق النهائي' }).click();

      const customerContext = await browser.newContext();
      contexts.push(customerContext);
      await authenticateContext(prisma!, customerContext, customerUser);
      const customerPage = await customerContext.newPage();
      await customerPage.goto(`/account/bookings/${booking.id}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await expect(customerPage.getByRole('heading', { name: bookingNumber })).toBeVisible();
      await expect.poll(async () => prisma!.booking.findUnique({
        where: { id: booking.id }, select: { bookingStatus: true },
      }), { timeout: 30_000 }).toEqual({ bookingStatus: BookingStatus.CLOSED });
      expect(await prisma!.qualityReview.findUnique({ where: { bookingId: booking.id } }))
        .toMatchObject({ approved: true, returnedToTeam: false });

    } finally {
      await Promise.all(contexts.map((context) => context.close()));
      await prisma!.branch.update({
        where: { id: method!.branchId }, data: { assignmentMode: originalAssignmentMode },
      });
      await prisma!.qualityReview.deleteMany({ where: { bookingId: booking.id } });
      await cleanupAcceptancePaymentRecords(prisma!, booking.id);
      // Invoices intentionally retain a restrictive booking FK in production;
      // remove the acceptance artifact before deleting its booking.
      await prisma!.invoice.deleteMany({ where: { bookingId: booking.id } });
      await prisma!.bookingAssignmentHistory.deleteMany({ where: { bookingId: booking.id } });
      await prisma!.booking.deleteMany({ where: { id: booking.id } });
      await prisma!.team.delete({ where: { id: team.id } });
      await prisma!.service.delete({ where: { id: service.id } });
      await cleanupAcceptanceUsers(prisma!, [customerUser.id, manager.id, technician.id]);
    }
  });
});

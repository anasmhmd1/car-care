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
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { localDateTimeToUtc } from '../src/lib/engine/time';
import {
  authenticateContext,
  cleanupAcceptancePaymentRecords,
  cleanupAcceptanceUsers,
  createAcceptancePrisma,
  createAcceptanceUser,
  probeAcceptanceDatabase,
  sessionPrerequisite,
  VALID_PNG_BUFFER,
} from './support/acceptance';

test.describe.configure({ mode: 'serial' });

const tinyPng = {
  name: 'evidence.png',
  mimeType: 'image/png',
  buffer: VALID_PNG_BUFFER,
};

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
        minimumBeforePhotos: 1,
        minimumAfterPhotos: 1,
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
    const uploadedFilePaths: string[] = [];

    try {
      const managerContext = await browser.newContext();
      contexts.push(managerContext);
      await authenticateContext(prisma!, managerContext, manager);
      const managerPage = await managerContext.newPage();
      await managerPage.goto('/operations');

      const proofCard = managerPage.locator('article').filter({ hasText: bookingNumber });
      await proofCard.getByRole('button', { name: 'فتح المراجعة' }).click();
      await managerPage.getByRole('button', { name: 'اعتماد الإثبات' }).click();
      await expect.poll(async () => prisma!.booking.findUnique({
        where: { id: booking.id }, select: { bookingStatus: true, amountPaid: true },
      })).toEqual({ bookingStatus: BookingStatus.AWAITING_OPERATIONS_REVIEW, amountPaid: 300 });

      await managerPage.reload();
      await managerPage.getByRole('button', { name: /حجوزات بانتظار القرار/ }).click();
      const reviewCard = managerPage.locator('article').filter({ hasText: bookingNumber });
      await reviewCard.getByRole('button', { name: 'اتخاذ القرار' }).click();
      await managerPage.locator('#booking-review-reason').fill('قبول رحلة الاختبار الكاملة');
      await managerPage.getByRole('dialog').getByRole('button', { name: 'اعتماد' }).click();
      await expect.poll(async () => prisma!.booking.findUnique({
        where: { id: booking.id }, select: { bookingStatus: true },
      })).toEqual({ bookingStatus: BookingStatus.AWAITING_ASSIGNMENT });

      await managerPage.reload();
      await managerPage.getByRole('button', { name: /حجوزات تحتاج فريقًا/ }).click();
      const assignmentCard = managerPage.locator('article').filter({ hasText: bookingNumber });
      await assignmentCard.getByRole('button', { name: 'اختيار فريق' }).click();
      await managerPage.locator('#team-id').selectOption(team.id);
      await managerPage.locator('#assignment-reason').fill('إسناد فريق اختبار رحلة القبول');
      await managerPage.getByRole('button', { name: 'إعادة الفحص ثم الإسناد' }).click();
      await expect.poll(async () => prisma!.booking.findUnique({
        where: { id: booking.id }, select: { bookingStatus: true, assignedTeamId: true },
      })).toEqual({ bookingStatus: BookingStatus.ASSIGNED, assignedTeamId: team.id });

      const technicianContext = await browser.newContext();
      contexts.push(technicianContext);
      await authenticateContext(prisma!, technicianContext, technician);
      const technicianPage = await technicianContext.newPage();
      await technicianPage.goto('/staff');
      await expect(technicianPage.getByRole('heading', { name: bookingNumber })).toBeVisible();

      await technicianPage.getByTestId('workflow-TEAM_ACKNOWLEDGED').click();
      await expect.poll(async () => prisma!.booking.findUnique({
        where: { id: booking.id }, select: { bookingStatus: true },
      })).toEqual({ bookingStatus: BookingStatus.TEAM_ACKNOWLEDGED });

      for (const item of service.checklistTemplates
        .filter((template) => template.stage === ChecklistStage.TEAM_PREPARATION)
        .flatMap((template) => template.items)) {
        const control = technicianPage.getByTestId(`checklist-item-${item.id}`);
        await control.click();
        await expect(control).toHaveAttribute('aria-pressed', 'true');
      }

      for (const status of ['ON_THE_WAY', 'ARRIVED'] as const) {
        await technicianPage.getByTestId(`workflow-${status}`).click();
        await expect.poll(async () => prisma!.booking.findUnique({
          where: { id: booking.id }, select: { bookingStatus: true },
        })).toEqual({ bookingStatus: status });
      }

      for (const item of service.checklistTemplates
        .filter((template) => template.stage === ChecklistStage.ARRIVAL_INSPECTION)
        .flatMap((template) => template.items)) {
        const control = technicianPage.getByTestId(`checklist-item-${item.id}`);
        await control.click();
        await expect(control).toHaveAttribute('aria-pressed', 'true');
      }

      await technicianPage.locator('#photo-type').selectOption('BEFORE_SERVICE');
      await technicianPage.getByTestId('technician-photo-file').setInputFiles(tinyPng);
      await technicianPage.getByTestId('technician-photo-submit').click();
      await expect.poll(async () => prisma!.bookingFile.count({
        where: { bookingId: booking.id, fileType: 'BEFORE_SERVICE' },
      })).toBe(1);

      await technicianPage.getByTestId('workflow-IN_SERVICE').click();
      await expect.poll(async () => prisma!.booking.findUnique({
        where: { id: booking.id }, select: { bookingStatus: true },
      })).toEqual({ bookingStatus: BookingStatus.IN_SERVICE });

      for (const item of service.checklistTemplates
        .filter((template) => (
          template.stage === ChecklistStage.SERVICE_EXECUTION ||
          template.stage === ChecklistStage.CLOSING
        ))
        .flatMap((template) => template.items)) {
        const control = technicianPage.getByTestId(`checklist-item-${item.id}`);
        await control.click();
        await expect(control).toHaveAttribute('aria-pressed', 'true');
      }

      await technicianPage.locator('#photo-type').selectOption('AFTER_SERVICE');
      await technicianPage.getByTestId('technician-photo-file').setInputFiles(tinyPng);
      await technicianPage.getByTestId('technician-photo-submit').click();
      await expect.poll(async () => prisma!.bookingFile.count({
        where: { bookingId: booking.id, fileType: 'AFTER_SERVICE' },
      })).toBe(1);

      await technicianPage.getByTestId('workflow-QUALITY_REVIEW').click();
      await expect.poll(async () => prisma!.booking.findUnique({
        where: { id: booking.id }, select: { bookingStatus: true },
      })).toEqual({ bookingStatus: BookingStatus.QUALITY_REVIEW });

      await managerPage.goto('/operations');
      const qualityCase = managerPage.locator('details').filter({ hasText: bookingNumber });
      await qualityCase.locator('summary').click();
      await qualityCase.locator('textarea[name="notes"]').fill('جودة التنفيذ مكتملة');
      await qualityCase.locator('button[name="approved"][value="true"]').click();
      await expect.poll(async () => prisma!.booking.findUnique({
        where: { id: booking.id }, select: { bookingStatus: true },
      })).toEqual({ bookingStatus: BookingStatus.SERVICE_COMPLETED });

      await managerPage.reload();
      await managerPage.getByRole('button', { name: /الحجوزات النشطة/ }).click();
      const activeRow = managerPage.locator('tr').filter({ hasText: bookingNumber });
      await activeRow.getByRole('button', { name: /تحصيل 700/ }).click();
      await managerPage.locator('#settlement-notes').fill('تحصيل الرصيد عند اكتمال الخدمة');
      await managerPage.getByRole('button', { name: /تأكيد تسجيل 700/ }).click();
      await expect.poll(async () => prisma!.booking.findUnique({
        where: { id: booking.id }, select: { amountDue: true, paymentStatus: true },
      })).toEqual({ amountDue: 0, paymentStatus: PaymentStatus.FULLY_PAID });

      await technicianPage.reload();
      await technicianPage.getByTestId('workflow-DELIVERED').click();
      await expect.poll(async () => prisma!.booking.findUnique({
        where: { id: booking.id }, select: { bookingStatus: true },
      })).toEqual({ bookingStatus: BookingStatus.DELIVERED });

      await managerPage.reload();
      await managerPage.getByRole('button', { name: /الحجوزات النشطة/ }).click();
      const deliveredRow = managerPage.locator('tr').filter({ hasText: bookingNumber });
      await deliveredRow.getByRole('button', { name: 'إغلاق الحجز' }).click();
      await managerPage.locator('#close-reason').fill('إغلاق رحلة القبول بعد التسليم والسداد');
      await managerPage.getByRole('button', { name: 'تأكيد الإغلاق النهائي' }).click();

      const customerContext = await browser.newContext();
      contexts.push(customerContext);
      await authenticateContext(prisma!, customerContext, customerUser);
      const customerPage = await customerContext.newPage();
      await customerPage.goto(`/account/bookings/${booking.id}`);
      await expect(customerPage.getByText(bookingNumber)).toBeVisible();
      await expect.poll(async () => prisma!.booking.findUnique({
        where: { id: booking.id }, select: { bookingStatus: true },
      })).toEqual({ bookingStatus: BookingStatus.CLOSED });
      expect(await prisma!.qualityReview.findUnique({ where: { bookingId: booking.id } }))
        .toMatchObject({ approved: true, returnedToTeam: false });

      const files = await prisma!.bookingFile.findMany({
        where: { bookingId: booking.id }, select: { fileUrl: true },
      });
      for (const file of files) {
        if (file.fileUrl.startsWith('/api/files/')) {
          uploadedFilePaths.push(file.fileUrl.replace('/api/files/', ''));
        }
      }
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
      const files = await prisma!.bookingFile.findMany({
        where: { bookingId: booking.id }, select: { fileUrl: true },
      });
      for (const file of files) {
        if (file.fileUrl.startsWith('/api/files/')) {
          const relativePath = file.fileUrl.replace('/api/files/', '');
          if (!uploadedFilePaths.includes(relativePath)) uploadedFilePaths.push(relativePath);
        }
      }
      await prisma!.branch.update({
        where: { id: method!.branchId }, data: { assignmentMode: originalAssignmentMode },
      });
      await prisma!.qualityReview.deleteMany({ where: { bookingId: booking.id } });
      await cleanupAcceptancePaymentRecords(prisma!, booking.id);
      await prisma!.bookingAssignmentHistory.deleteMany({ where: { bookingId: booking.id } });
      await prisma!.booking.deleteMany({ where: { id: booking.id } });
      await prisma!.team.delete({ where: { id: team.id } });
      await prisma!.service.delete({ where: { id: service.id } });
      await cleanupAcceptanceUsers(prisma!, [customerUser.id, manager.id, technician.id]);
      const uploadRoot = process.env.UPLOAD_DIR || path.join(process.cwd(), 'data', 'uploads');
      for (const relativePath of uploadedFilePaths) {
        await unlink(path.join(uploadRoot, relativePath)).catch(() => undefined);
      }
    }
  });
});

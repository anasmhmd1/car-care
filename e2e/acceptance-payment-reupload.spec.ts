import { expect, test, type BrowserContext } from '@playwright/test';
import {
  BookingHoldStatus,
  BookingStatus,
  PaymentStatus,
  ProofStatus,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import {
  authenticateContext,
  cleanupAcceptancePaymentRecords,
  cleanupAcceptanceUsers,
  createAcceptancePrisma,
  createAcceptanceUser,
  createMinimalCustomerBooking,
  probeAcceptanceDatabase,
  sessionPrerequisite,
  VALID_PNG_BUFFER,
} from './support/acceptance';

test.describe.configure({ mode: 'serial' });

test.describe('Payment re-upload acceptance', () => {
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

  test('scenario 6: short proof reason is visible, replacement verifies once under concurrent review', async ({ browser }) => {
    test.setTimeout(240_000);
    const booking = await createMinimalCustomerBooking(prisma!, 'payment-reupload', {
      bookingStatus: BookingStatus.PAYMENT_UNDER_REVIEW,
      paymentStatus: PaymentStatus.UNDER_REVIEW,
      totalPrice: 1_000,
      depositAmount: 300,
    });
    const manager = await createAcceptanceUser(prisma!, UserRole.OPERATIONS_MANAGER, 'payment-manager');
    await prisma!.branchMembership.create({
      data: { branchId: booking.branchId, userId: manager.id },
    });
    const holdTeam = await prisma!.team.create({
      data: {
        branchId: booking.branchId,
        name: `E2E payment hold ${randomUUID().slice(0, 8)}`,
        dailyCapacity: 1,
      },
    });
    const initialProof = await prisma!.paymentProof.create({
      data: {
        bookingId: booking.bookingId,
        paymentMethodId: booking.paymentMethodId,
        senderName: booking.user.fullName,
        senderPhoneOrAccount: booking.user.phone,
        referenceNumber: `E2E-SHORT-${randomUUID().slice(0, 8)}`,
        amountSubmitted: 100,
        transferTimestamp: new Date(Date.now() - 60_000),
        proofFileUrl: `/api/files/payment-proofs/e2e-initial-${randomUUID()}.png`,
        status: ProofStatus.UNDER_REVIEW,
        idempotencyKey: `e2e-initial-proof-${randomUUID()}`,
      },
    });
    await prisma!.bookingHold.create({
      data: {
        bookingId: booking.bookingId,
        teamId: holdTeam.id,
        slotStartTime: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        slotEndTime: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        status: BookingHoldStatus.ACTIVE,
      },
    });

    const contexts: BrowserContext[] = [];
    const uploadedPaths: string[] = [];
    try {
      const managerContext = await browser.newContext();
      contexts.push(managerContext);
      await authenticateContext(prisma!, managerContext, manager);
      const managerPage = await managerContext.newPage();
      await managerPage.goto('/operations');
      const initialCard = managerPage.locator('article').filter({ hasText: booking.bookingNumber });
      await expect(initialCard).toBeVisible();
      await initialCard.getByRole('button', { name: 'فتح المراجعة' }).click();
      await managerPage.locator('#proof-notes').fill('E2E amount is below the required deposit');
      await managerPage.getByRole('button', { name: 'المبلغ ناقص' }).click();

      await expect.poll(async () => prisma!.paymentProof.findUnique({
        where: { id: initialProof.id },
        select: { status: true, reviewNotes: true },
      })).toEqual({
        status: ProofStatus.AMOUNT_SHORT,
        reviewNotes: 'E2E amount is below the required deposit',
      });
      await expect.poll(async () => prisma!.booking.findUnique({
        where: { id: booking.bookingId },
        select: { bookingStatus: true, paymentStatus: true },
      })).toEqual({
        bookingStatus: BookingStatus.AWAITING_PAYMENT_PROOF,
        paymentStatus: PaymentStatus.AMOUNT_SHORT,
      });
      expect(await prisma!.payment.count({ where: { bookingId: booking.bookingId } })).toBe(0);

      const customerContext = await browser.newContext();
      contexts.push(customerContext);
      await authenticateContext(prisma!, customerContext, booking.user);
      const customerPage = await customerContext.newPage();
      await customerPage.goto(`/account/bookings/${booking.bookingId}`);
      await expect(customerPage.getByText('E2E amount is below the required deposit')).toBeVisible();
      await expect(customerPage.getByText(ProofStatus.AMOUNT_SHORT, { exact: true }).first()).toBeVisible();

      await customerPage.locator('#amount-submitted').fill('300');
      await customerPage.locator('#reference-number').fill(`E2E-REUPLOAD-${randomUUID().slice(0, 8)}`);
      const localTransferTime = new Date(Date.now() - 2 * 60_000).toISOString().slice(0, 16);
      await customerPage.locator('#transfer-time').fill(localTransferTime);
      await customerPage.locator('#payment-file').setInputFiles({
        name: 'replacement.png',
        mimeType: 'image/png',
        buffer: VALID_PNG_BUFFER,
      });
      await customerPage.getByRole('button', { name: 'رفع وإرسال للمراجعة' }).click();

      const paymentFeedback = customerPage.locator('[aria-live="polite"]');
      await expect.poll(async () => {
        const count = await prisma!.paymentProof.count({
          where: { bookingId: booking.bookingId, status: ProofStatus.UNDER_REVIEW },
        });
        if (count === 1) return 'created';
        const message = (await paymentFeedback.innerText()).trim();
        return message ? `feedback: ${message}` : 'pending';
      }, {
        message: 'The replacement proof must be created; UI feedback is surfaced on failure.',
      }).toBe('created');
      const replacementProof = await prisma!.paymentProof.findFirstOrThrow({
        where: { bookingId: booking.bookingId, status: ProofStatus.UNDER_REVIEW },
        orderBy: { createdAt: 'desc' },
      });
      const uploadedFile = await prisma!.bookingFile.findUnique({
        where: { id: replacementProof.proofFileId! },
        select: { fileUrl: true },
      });
      if (uploadedFile?.fileUrl.startsWith('/api/files/')) {
        uploadedPaths.push(uploadedFile.fileUrl.replace('/api/files/', ''));
      }

      const secondManagerContext = await browser.newContext();
      contexts.push(secondManagerContext);
      await authenticateContext(prisma!, secondManagerContext, manager);
      const secondManagerPage = await secondManagerContext.newPage();
      await Promise.all([managerPage.reload(), secondManagerPage.goto('/operations')]);

      for (const page of [managerPage, secondManagerPage]) {
        const card = page.locator('article').filter({ hasText: booking.bookingNumber });
        await expect(card).toBeVisible();
        await card.getByRole('button', { name: 'فتح المراجعة' }).click();
        await expect(page.getByRole('dialog')).toContainText(booking.bookingNumber);
      }
      await Promise.all([
        managerPage.getByRole('button', { name: 'اعتماد الإثبات' }).click(),
        secondManagerPage.getByRole('button', { name: 'اعتماد الإثبات' }).click(),
      ]);

      await expect.poll(async () => prisma!.payment.count({
        where: { bookingId: booking.bookingId },
      })).toBe(1);
      await expect.poll(async () => prisma!.booking.findUnique({
        where: { id: booking.bookingId },
        select: { bookingStatus: true, amountPaid: true },
      })).toEqual({
        bookingStatus: BookingStatus.AWAITING_OPERATIONS_REVIEW,
        amountPaid: 300,
      });
      expect(await prisma!.payment.count({ where: { proofId: replacementProof.id } })).toBe(1);
      expect(await prisma!.paymentProof.findUnique({ where: { id: initialProof.id }, select: { status: true } }))
        .toEqual({ status: ProofStatus.AMOUNT_SHORT });
      expect(await prisma!.paymentProof.findUnique({ where: { id: replacementProof.id }, select: { status: true } }))
        .toEqual({ status: ProofStatus.VERIFIED });
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
      await cleanupAcceptancePaymentRecords(prisma!, booking.bookingId);
      await prisma!.bookingStatusHistory.deleteMany({ where: { bookingId: booking.bookingId } });
      await prisma!.bookingHold.deleteMany({ where: { bookingId: booking.bookingId } });
      await prisma!.bookingFile.deleteMany({ where: { bookingId: booking.bookingId } });
      await prisma!.booking.deleteMany({ where: { id: booking.bookingId } });
      await prisma!.team.delete({ where: { id: holdTeam.id } });
      await cleanupAcceptanceUsers(prisma!, [booking.user.id, manager.id]);

      const uploadRoot = process.env.UPLOAD_DIR || path.join(process.cwd(), 'data', 'uploads');
      for (const relativePath of uploadedPaths) {
        await unlink(path.join(uploadRoot, relativePath)).catch(() => undefined);
      }
    }
  });
});

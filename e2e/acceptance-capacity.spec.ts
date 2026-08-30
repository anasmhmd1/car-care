import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { BookingHoldStatus, UserRole, VehicleSize } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  authenticateContext,
  cleanupAcceptanceUsers,
  createAcceptancePrisma,
  createAcceptanceUser,
  probeAcceptanceDatabase,
  sessionPrerequisite,
} from './support/acceptance';

type BookingSubmissionOutcome =
  | { kind: 'created'; message: null }
  | { kind: 'rejected'; message: string };

async function readBookingSubmissionOutcome(
  page: Page,
): Promise<BookingSubmissionOutcome | null> {
  if (/\/account\/bookings\//.test(page.url())) {
    return { kind: 'created', message: null };
  }

  // Next.js adds an empty route-announcer alert outside the application shell.
  // Read the booking form's alert only, otherwise the test can report a false
  // rejection before the asynchronous server action has settled.
  const alert = page.locator('main [role="alert"]').first();
  if (!(await alert.isVisible())) return null;
  const message = (await alert.innerText()).trim();
  return message ? { kind: 'rejected', message } : null;
}

async function waitForBookingSubmissionOutcome(page: Page) {
  await expect.poll(
    async () => (await readBookingSubmissionOutcome(page))?.kind ?? 'pending',
    {
      timeout: 60_000,
      message: 'The booking submission must finish with either a redirect or a visible rejection.',
    },
  ).not.toBe('pending');

  const outcome = await readBookingSubmissionOutcome(page);
  if (!outcome) throw new Error('The observed booking outcome disappeared before it could be asserted.');
  return outcome;
}

test.describe.configure({ mode: 'serial' });

test.describe('Capacity contention acceptance', () => {
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

  test('scenario 3: two browsers competing for the final slot produce one booking only', async ({ browser }) => {
    test.setTimeout(240_000);
    const paymentMethod = await prisma!.branchPaymentMethod.findFirst({
      where: { active: true, branch: { status: 'ACTIVE' } },
      include: { branch: { include: { workingHours: true } } },
    });
    const area = paymentMethod
      ? await prisma!.coverageArea.findFirst({
          where: { active: true, zone: { branchId: paymentMethod.branchId } },
        })
      : null;
    expect(paymentMethod && area, 'Run the seed: an active branch, payment method and coverage area are required.').toBeTruthy();
    const cancellationPolicy = await prisma!.cancellationPolicy.findFirst({
      where: { active: true, isDefault: true },
    });
    expect(cancellationPolicy, 'Run the seed: an active default cancellation policy is required.').toBeTruthy();

    const openHours = paymentMethod!.branch.workingHours.find((hours) => !hours.isClosed);
    expect(openHours, 'The active branch must have at least one open day.').toBeTruthy();
    let bookingDate = '';
    for (let offset = 14; offset <= 28; offset += 1) {
      const candidate = new Date(Date.now() + offset * 24 * 60 * 60 * 1000);
      if (candidate.getUTCDay() === openHours!.dayOfWeek) {
        bookingDate = candidate.toISOString().slice(0, 10);
        break;
      }
    }
    expect(bookingDate).not.toBe('');

    const nonce = randomUUID();
    const employee = await createAcceptanceUser(prisma!, UserRole.EMPLOYEE, 'capacity-technician');
    const service = await prisma!.service.create({
      data: {
        cancellationPolicyId: cancellationPolicy!.id,
        nameAr: `اختبار السعة ${nonce.slice(0, 8)}`,
        nameEn: 'E2E Capacity',
        slug: `e2e-capacity-${nonce}`,
        shortDescriptionAr: 'خدمة مؤقتة لاختبار منع الحجز المزدوج من المتصفح.',
        fullDescriptionAr: 'خدمة مؤقتة لاختبار منع الحجز المزدوج من المتصفح.',
        coverImage: '/images/service-care.svg',
        basePrice: 500,
        durationMinutes: 60,
        requiredTeamSize: 1,
        requiresDeposit: false,
        active: true,
        bookableOnline: true,
        variants: { create: { vehicleSize: VehicleSize.SEDAN, price: 500, durationMinutes: 60 } },
        branchServices: {
          create: { branchId: paymentMethod!.branchId, active: true, bookableOnline: true },
        },
      },
    });
    const team = await prisma!.team.create({
      data: {
        branchId: paymentMethod!.branchId,
        name: `E2E Final Capacity ${nonce.slice(0, 8)}`,
        dailyCapacity: 1,
        active: true,
        assignmentPriority: 1,
        members: { create: { userId: employee.id, isLeader: true } },
        capabilities: { create: { serviceId: service.id } },
      },
    });

    const customers = await Promise.all(['A', 'B'].map(async (label, index) => {
      const user = await createAcceptanceUser(prisma!, UserRole.CUSTOMER, `capacity-${label}`);
      const profile = await prisma!.customerProfile.create({ data: { userId: user.id } });
      const vehicle = await prisma!.vehicle.create({
        data: {
          customerId: profile.id,
          make: 'E2E',
          model: `Capacity ${label}`,
          year: 2026,
          color: 'Black',
          vehicleSize: VehicleSize.SEDAN,
          isDefault: true,
        },
      });
      const address = await prisma!.customerAddress.create({
        data: {
          customerId: profile.id,
          governorate: area!.governorate,
          city: area!.city,
          district: area!.district,
          compound: area!.compound,
          street: `E2E Street ${label}`,
          buildingNumber: String(index + 1),
          isDefault: true,
        },
      });
      return { user, vehicle, address };
    }));

    const contexts: BrowserContext[] = [];
    async function prepareBookingPage(customerIndex: number): Promise<Page> {
      const context = await browser.newContext();
      contexts.push(context);
      const customer = customers[customerIndex];
      await authenticateContext(prisma!, context, customer.user);
      const page = await context.newPage();
      await page.goto(`/services/${service.slug}/book?vehicleId=${customer.vehicle.id}&addressId=${customer.address.id}`);
      await page.getByTestId('booking-step-1-next').click();
      await page.getByTestId('booking-step-2-next').click();
      await page.locator('#booking-date').fill(bookingDate);
      const firstSlot = page.locator('input[name="booking-slot"]').first();
      await expect(firstSlot).toBeVisible({ timeout: 60_000 });
      await firstSlot.check();
      await page.getByTestId('booking-step-3-next').click();
      await page.getByTestId('booking-step-4-next').click();
      await page.locator('#contact-phone').fill(`0100000000${customerIndex}`);
      await page.locator('#contact-whatsapp').fill(`0100000000${customerIndex}`);
      await page.getByTestId('booking-step-4-next').click();
      await page.locator('#policy-accepted').check();
      return page;
    }

    try {
      const [firstPage, secondPage] = await Promise.all([
        prepareBookingPage(0),
        prepareBookingPage(1),
      ]);
      await Promise.all([
        firstPage.getByTestId('booking-submit').click(),
        secondPage.getByTestId('booking-submit').click(),
      ]);

      // A Playwright click only dispatches the React event; it does not await
      // the async server action used by the handler. Observe both UI outcomes
      // before reading the database or closing either browser context.
      const pages = [firstPage, secondPage];
      const outcomes = await Promise.all(pages.map(async (page) => ({
        page,
        outcome: await waitForBookingSubmissionOutcome(page),
      })));
      expect(
        outcomes.map(({ outcome }) => outcome.kind).sort(),
        JSON.stringify(outcomes.map(({ outcome }) => outcome)),
      ).toEqual(['created', 'rejected']);

      await expect.poll(async () => prisma!.booking.count({
        where: { serviceId: service.id, deletedAt: null },
      })).toBe(1);
      const created = await prisma!.booking.findFirstOrThrow({ where: { serviceId: service.id } });
      expect(await prisma!.bookingHold.count({
        where: { bookingId: created.id, status: BookingHoldStatus.ACTIVE },
      })).toBe(1);

      const rejectedPage = outcomes.find(({ outcome }) => outcome.kind === 'rejected')!.page;
      await expect(rejectedPage.locator('main [role="alert"]').first()).toContainText(/لم يعد متاح|حُجز/);
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
      const bookingIds = (await prisma!.booking.findMany({
        where: { serviceId: service.id }, select: { id: true },
      })).map(({ id }) => id);
      if (bookingIds.length) {
        await prisma!.bookingStatusHistory.deleteMany({ where: { bookingId: { in: bookingIds } } });
        await prisma!.bookingHold.deleteMany({ where: { bookingId: { in: bookingIds } } });
        await prisma!.bookingItem.deleteMany({ where: { bookingId: { in: bookingIds } } });
        await prisma!.invoice.deleteMany({ where: { bookingId: { in: bookingIds } } });
        await prisma!.booking.deleteMany({ where: { id: { in: bookingIds } } });
      }
      await prisma!.team.delete({ where: { id: team.id } });
      await prisma!.service.delete({ where: { id: service.id } });
      await cleanupAcceptanceUsers(prisma!, [
        employee.id,
        ...customers.map(({ user }) => user.id),
      ]);
    }
  });
});

import { expect, test, type BrowserContext } from '@playwright/test';
import { UserRole, VehicleSize } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  authenticateContext,
  cleanupAcceptanceUsers,
  createAcceptancePrisma,
  createAcceptanceUser,
  probeAcceptanceDatabase,
  sessionPrerequisite,
} from './support/acceptance';

test.describe.configure({ mode: 'serial' });

test.describe('Outside-coverage customer guidance', () => {
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

  test('scenario 12: an unsupported saved address exposes no slots and offers WhatsApp contact', async ({ browser }) => {
    const service = await prisma!.service.findFirst({
      where: {
        active: true,
        bookableOnline: true,
        variants: { some: { vehicleSize: VehicleSize.SEDAN } },
      },
      select: { slug: true },
    });
    expect(service, 'Run the seed before browser acceptance.').toBeTruthy();

    const user = await createAcceptanceUser(prisma!, UserRole.CUSTOMER, 'outside-coverage');
    const customer = await prisma!.customerProfile.create({ data: { userId: user.id } });
    await prisma!.vehicle.create({
      data: {
        customerId: customer.id,
        make: 'E2E',
        model: 'Coverage',
        year: 2026,
        color: 'Black',
        vehicleSize: VehicleSize.SEDAN,
        isDefault: true,
      },
    });
    const unsupportedCompound = `Outside-${randomUUID()}`;
    await prisma!.customerAddress.create({
      data: {
        customerId: customer.id,
        governorate: 'Outside',
        city: 'Outside',
        district: 'Outside',
        compound: unsupportedCompound,
        street: 'E2E Street',
        buildingNumber: '1',
        isDefault: true,
      },
    });

    let context: BrowserContext | null = null;
    try {
      context = await browser.newContext();
      await authenticateContext(prisma!, context, user);
      const page = await context.newPage();
      await page.goto(`/services/${service!.slug}/book`);
      await page.getByTestId('booking-step-1-next').click();
      await page.getByTestId('booking-step-2-next').click();

      const unsupportedAddress = page.locator('label').filter({ hasText: unsupportedCompound });
      await expect(unsupportedAddress).toBeVisible();
      await expect(unsupportedAddress.getByRole('radio')).toBeDisabled();
      await expect(page.getByTestId('outside-coverage-contact')).toBeVisible();
      await expect(page.getByTestId('outside-coverage-contact').getByRole('link', { name: /واتساب/ }))
        .toHaveAttribute('href', /^https:\/\/wa\.me\//);
      await expect(page.locator('#booking-date')).toHaveCount(0);
    } finally {
      await context?.close();
      await cleanupAcceptanceUsers(prisma!, [user.id]);
    }
  });
});

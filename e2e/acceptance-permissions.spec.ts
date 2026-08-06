import { expect, test, type BrowserContext } from '@playwright/test';
import { UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  authenticateContext,
  cleanupAcceptanceUsers,
  createAcceptancePrisma,
  createAcceptanceUser,
  createMinimalCustomerBooking,
  probeAcceptanceDatabase,
  sessionPrerequisite,
} from './support/acceptance';

test.describe.configure({ mode: 'serial' });

test.describe('Cross-role and cross-tenant authorization', () => {
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

  test('scenario 10: employee, customer, manager, and owner boundaries hold in rendered routes', async ({ browser }) => {
    test.setTimeout(180_000);
    const customerA = await createMinimalCustomerBooking(prisma!, 'idor-a');
    const customerB = await createMinimalCustomerBooking(prisma!, 'idor-b');
    const manager = await createAcceptanceUser(prisma!, UserRole.OPERATIONS_MANAGER, 'branch-a-manager');
    const employee = await createAcceptanceUser(prisma!, UserRole.EMPLOYEE, 'no-revenue-employee');
    const owner = await createAcceptanceUser(prisma!, UserRole.OWNER, 'all-branches-owner');
    await prisma!.branchMembership.create({
      data: { branchId: customerA.branchId, userId: manager.id },
    });
    const branchA = await prisma!.branch.findUniqueOrThrow({ where: { id: customerA.branchId } });
    const nonce = randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
    const branchB = await prisma!.branch.create({
      data: {
        nameAr: `E2E Scoped Branch B ${nonce}`,
        nameEn: `E2E Scoped Branch B ${nonce}`,
        code: `SCOPE-${nonce}`,
        address: 'E2E branch scope address',
        phone: '01012345678',
        whatsapp: '01012345678',
        status: 'ACTIVE',
      },
    });
    const contexts: BrowserContext[] = [];

    try {
      const employeeContext = await browser.newContext();
      contexts.push(employeeContext);
      await authenticateContext(prisma!, employeeContext, employee);
      const employeePage = await employeeContext.newPage();
      await employeePage.goto('/admin/reports');
      await expect(employeePage).toHaveURL(/\/staff(?:\?|$)/);
      await expect(employeePage).not.toHaveURL(/\/admin\/reports/);

      const customerContext = await browser.newContext();
      contexts.push(customerContext);
      await authenticateContext(prisma!, customerContext, customerA.user);
      const customerPage = await customerContext.newPage();
      const crossCustomerResponse = await customerPage.goto(`/account/bookings/${customerB.bookingId}`);
      // App Router may commit a streamed response before notFound() is resolved,
      // producing a documented soft 404 (HTTP 200 + noindex) instead of HTTP 404.
      expect([200, 404]).toContain(crossCustomerResponse?.status());
      await expect(customerPage.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
      await expect(customerPage.getByText(customerB.bookingNumber)).toHaveCount(0);

      const managerContext = await browser.newContext();
      contexts.push(managerContext);
      await authenticateContext(prisma!, managerContext, manager);
      const managerPage = await managerContext.newPage();
      await managerPage.goto('/operations');
      await expect(managerPage.getByText(branchA.nameAr, { exact: true })).toBeVisible();
      await expect(managerPage.getByText(branchB.nameAr, { exact: true })).toHaveCount(0);

      const ownerContext = await browser.newContext();
      contexts.push(ownerContext);
      await authenticateContext(prisma!, ownerContext, owner);
      const ownerPage = await ownerContext.newPage();
      await ownerPage.goto('/operations');
      await expect(ownerPage.getByText(branchA.nameAr, { exact: false }).first()).toBeVisible();
      await expect(ownerPage.getByText(branchB.nameAr, { exact: false }).first()).toBeVisible();
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
      await prisma!.booking.deleteMany({
        where: { id: { in: [customerA.bookingId, customerB.bookingId] } },
      });
      await prisma!.branch.deleteMany({ where: { id: branchB.id } });
      await cleanupAcceptanceUsers(prisma!, [
        customerA.user.id,
        customerB.user.id,
        manager.id,
        employee.id,
        owner.id,
      ]);
    }
  });
});

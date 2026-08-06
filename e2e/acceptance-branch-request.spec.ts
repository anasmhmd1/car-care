import { expect, test, type BrowserContext } from '@playwright/test';
import { BranchRequestStatus, UserRole } from '@prisma/client';
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

test.describe('Branch request ownership boundary', () => {
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

  test('scenario 9: owner requests only; system admin implements and creates the branch atomically', async ({ browser }) => {
    test.setTimeout(120_000);
    const owner = await createAcceptanceUser(prisma!, UserRole.OWNER, 'branch-owner');
    const admin = await createAcceptanceUser(prisma!, UserRole.SYSTEM_SUPER_ADMIN, 'branch-admin');
    const brand = await prisma!.brandSettings.findFirst();
    const maxBranchesBefore = brand?.maxBranches ?? 1;
    const branchCountBefore = await prisma!.branch.count();
    const nonce = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
    const branchName = `E2E Requested Branch ${nonce}`;
    const branchCode = `E2E-${nonce}`;
    const contexts: BrowserContext[] = [];
    let requestId: string | null = null;
    let createdBranchId: string | null = null;

    try {
      const ownerContext = await browser.newContext();
      contexts.push(ownerContext);
      await authenticateContext(prisma!, ownerContext, owner);
      const ownerPage = await ownerContext.newPage();
      await ownerPage.goto('/admin?section=branches');
      await ownerPage.getByRole('button', { name: 'طلب فرع جديد' }).click();
      await ownerPage.locator('#branch-request-name').fill(branchName);
      await ownerPage.locator('#branch-request-reason').fill('E2E capacity expansion request');
      await ownerPage.getByRole('button', { name: 'تأكيد الإجراء' }).click();

      await expect.poll(async () => prisma!.branchRequest.findFirst({
        where: { ownerId: owner.id, branchName },
        select: { id: true, status: true },
      })).toEqual(expect.objectContaining({ status: BranchRequestStatus.PENDING }));
      const request = await prisma!.branchRequest.findFirstOrThrow({
        where: { ownerId: owner.id, branchName },
      });
      requestId = request.id;
      expect(await prisma!.branch.count()).toBe(branchCountBefore);
      expect(await prisma!.branch.findUnique({ where: { code: branchCode } })).toBeNull();

      const adminContext = await browser.newContext();
      contexts.push(adminContext);
      await authenticateContext(prisma!, adminContext, admin);
      const adminPage = await adminContext.newPage();
      await adminPage.goto('/system-admin');
      const requestCard = adminPage.locator('div').filter({ hasText: branchName })
        .filter({ has: adminPage.getByRole('button', { name: 'مراجعة الطلب واتخاذ القرار' }) })
        .first();
      await expect(requestCard).toBeVisible();
      await requestCard.getByRole('button', { name: 'مراجعة الطلب واتخاذ القرار' }).click();
      await adminPage.locator('#branch-code').fill(branchCode);
      await adminPage.locator('#branch-address').fill('E2E Cairo acceptance address');
      await adminPage.locator('#branch-phone').fill('01012345678');
      await adminPage.locator('#branch-whatsapp').fill('01012345678');
      await adminPage.getByRole('button', { name: 'موافقة وإنشاء الفرع' }).click();

      await expect.poll(async () => prisma!.branchRequest.findUnique({
        where: { id: request.id },
        select: { status: true, reviewedByUserId: true },
      })).toEqual({
        status: BranchRequestStatus.IMPLEMENTED,
        reviewedByUserId: admin.id,
      });
      const createdBranch = await prisma!.branch.findUnique({
        where: { code: branchCode },
        include: {
          memberships: { where: { userId: owner.id } },
          workingHours: true,
        },
      });
      expect(createdBranch).not.toBeNull();
      createdBranchId = createdBranch!.id;
      expect(createdBranch!.nameAr).toBe(branchName);
      expect(createdBranch!.memberships).toHaveLength(1);
      expect(createdBranch!.workingHours).toHaveLength(7);
      expect(await prisma!.auditLog.findFirst({
        where: {
          actorUserId: admin.id,
          entityType: 'BranchRequest',
          entityId: request.id,
          action: 'APPROVE_AND_CREATE_BRANCH',
        },
      })).not.toBeNull();
      const updatedBrand = await prisma!.brandSettings.findFirst();
      expect(updatedBrand!.maxBranches).toBeGreaterThanOrEqual(branchCountBefore + 1);
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
      if (requestId) await prisma!.branchRequest.deleteMany({ where: { id: requestId } });
      if (createdBranchId) await prisma!.branch.deleteMany({ where: { id: createdBranchId } });
      if (brand) {
        await prisma!.brandSettings.update({
          where: { id: brand.id },
          data: { maxBranches: maxBranchesBefore },
        });
      }
      await cleanupAcceptanceUsers(prisma!, [owner.id, admin.id]);
    }
  });
});

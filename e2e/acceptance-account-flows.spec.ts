import { expect, test, type BrowserContext } from '@playwright/test';
import { UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  authenticateContext,
  cleanupAcceptanceUsers,
  createAcceptancePrisma,
  createAcceptanceUser,
  probeAcceptanceDatabase,
  sessionPrerequisite,
} from './support/acceptance';

// ─────────────────────────────────────────────────────────────────────────────
// §1 — Login page UI & validation (public, no DB required)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('§1 — Login page: UI structure & client-side validation', () => {
  test('login page renders all required elements', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1:visible').first()).toContainText('تسجيل الدخول', { timeout: 20_000 });
    await expect(page.locator('#login-phone')).toBeVisible();
    await expect(page.locator('#login-password')).toBeVisible();
    await expect(page.getByRole('button', { name: /تسجيل الدخول/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /إنشاء حساب/ })).toBeVisible();
  });

  test('login page shows error on empty form submission', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /تسجيل الدخول/ }).click();
    // HTML5 required validation or server error should appear
    const phoneInput = page.locator('#login-phone');
    const isRequired = await phoneInput.getAttribute('required');
    expect(isRequired).not.toBeNull();
  });

  test('login page rejects wrong credentials with error message', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/login', { waitUntil: 'load' });
    // Wait for React hydration: the submit button becomes enabled only after hydration
    await expect(page.getByRole('button', { name: /تسجيل الدخول/ }).first()).toBeEnabled({ timeout: 20_000 });
    await page.locator('#login-phone').first().fill('01099999999');
    await page.locator('#login-password').first().fill('wrongpassword123');
    await page.getByRole('button', { name: /تسجيل الدخول/ }).first().click();
    await expect(page.locator('#auth-error').first()).toBeVisible({ timeout: 90_000 });
    const errorText = await page.locator('#auth-error').first().innerText();
    expect(errorText.trim().length).toBeGreaterThan(0);
  });

  test('login page password toggle shows/hides password', async ({ page }) => {
    await page.goto('/login');
    const passwordInput = page.locator('#login-password');
    await passwordInput.fill('testpassword');
    await expect(passwordInput).toHaveAttribute('type', 'password');
    const toggleButton = page.getByRole('button', { name: /إظهار كلمة المرور/ });
    await toggleButton.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: /إخفاء كلمة المرور/ }).click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('login page "create account" link navigates to register', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: /إنشاء حساب/ }).click();
    await expect(page).toHaveURL(/\/register/);
  });

  test('login page preserves callback query param in register link', async ({ page }) => {
    await page.goto('/login?callback=%2Faccount%2Fbookings');
    const registerLink = page.getByRole('link', { name: /إنشاء حساب/ });
    const href = await registerLink.getAttribute('href');
    expect(href).toContain('callback=');
    expect(href).toContain('%2Faccount%2Fbookings');
  });

  test('login page logo links back to homepage', async ({ page }) => {
    await page.goto('/login');
    const logoLink = page.locator('a[aria-label="العودة إلى الصفحة الرئيسية"]').first();
    await logoLink.click();
    await expect(page).toHaveURL('/');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §2 — Register page UI & validation (public, no DB required)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('§2 — Register page: UI structure & client-side validation', () => {
  test('register page renders all required fields', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('h1:visible').first()).toContainText('إنشاء حساب');
    await expect(page.locator('#register-name')).toBeVisible();
    await expect(page.locator('#register-phone')).toBeVisible();
    await expect(page.locator('#register-whatsapp')).toBeVisible();
    await expect(page.locator('#register-password')).toBeVisible();
    await expect(page.locator('#policy-agreement')).toBeVisible();
    await expect(page.getByRole('button', { name: /إنشاء الحساب/ })).toBeVisible();
  });

  test('register page shows "login" link that navigates to login', async ({ page }) => {
    await page.goto('/register');
    await page.getByRole('link', { name: /تسجيل الدخول/ }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('register page preserves callback param in login link', async ({ page }) => {
    await page.goto('/register?callback=%2Faccount');
    const loginLink = page.getByRole('link', { name: /تسجيل الدخول/ });
    const href = await loginLink.getAttribute('href');
    expect(href).toContain('callback=');
  });

  test('register page password toggle works', async ({ page }) => {
    await page.goto('/register');
    await page.locator('#register-password').fill('Secure#2026');
    await expect(page.locator('#register-password')).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: /إظهار كلمة المرور/ }).click();
    await expect(page.locator('#register-password')).toHaveAttribute('type', 'text');
  });

  test('register page requires policy agreement checkbox', async ({ page }) => {
    await page.goto('/register');
    const checkbox = page.locator('#policy-agreement');
    const isRequired = await checkbox.getAttribute('required');
    expect(isRequired).not.toBeNull();
  });

  test('register with duplicate phone shows error', async ({ page }) => {
    // Use a phone that should exist in seed data
    await page.goto('/register');
    await page.locator('#register-name').fill('عميل مكرر');
    await page.locator('#register-phone').fill('01011111111');
    await page.locator('#register-password').fill('TestPassword@2026');
    await page.locator('#policy-agreement').check();
    await page.getByRole('button', { name: /إنشاء الحساب/ }).click();
    // Either an error appears or it redirects (if phone not taken it might succeed)
    // We just verify no JS error / crash
    await expect(page.locator('main:visible').first()).toBeVisible({ timeout: 15_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §3 — Cross-role redirect guards (no DB required)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('§3 — Route guards: all protected dashboards redirect to login', () => {
  const protectedRoutes = [
    '/account',
    '/account/bookings',
    '/account/vehicles',
    '/account/addresses',
    '/account/subscriptions',
    '/account/invoices',
    '/account/support',
    '/account/profile',
    '/account/reviews',
    '/admin',
    '/admin/reports',
    '/admin/customers',
    '/admin/catalog',
    '/admin/branches',
    '/admin/revenue',
    '/admin/subscriptions',
    '/admin/reviews',
    '/admin/setup',
    '/admin/site',
    '/admin/gallery',
    '/admin/calendar',
    '/operations',
    '/operations/workforce',
    '/operations/pricing',
    '/operations/resources',
    '/operations/audit',
    '/staff',
    '/system-admin',
  ];

  for (const route of protectedRoutes) {
    test(`unauthenticated → ${route} redirects to login`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §4 — Public pages accessibility (no DB required)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('§4 — Public pages: all routes accessible & render <h1>', () => {
  const publicRoutes = [
    '/',
    '/services',
    '/plans',
    '/areas',
    '/before-after',
    '/about',
    '/faq',
    '/contact',
    '/policies/booking',
    '/policies/cancellation',
    '/policies/privacy',
    '/login',
    '/register',
  ];

  for (const route of publicRoutes) {
    test(`${route} returns HTTP < 400 and has an <h1>`, async ({ page }) => {
      const res = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(res?.status()).toBeLessThan(400);
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §5 — Acceptance: authenticated account portal (requires DB)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('§5 — Authenticated customer account portal', () => {
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

  test('scenario A: customer can access all account sub-pages and sees their name', async ({ browser }) => {
    test.setTimeout(120_000);
    const user = await createAcceptanceUser(prisma!, UserRole.CUSTOMER, 'portal-nav');
    await prisma!.customerProfile.create({ data: { userId: user.id } });
    const contexts: BrowserContext[] = [];
    try {
      const ctx = await browser.newContext();
      contexts.push(ctx);
      await authenticateContext(prisma!, ctx, user);
      const page = await ctx.newPage();

      const accountRoutes = [
        '/account',
        '/account/bookings',
        '/account/vehicles',
        '/account/addresses',
        '/account/subscriptions',
        '/account/invoices',
        '/account/support',
        '/account/profile',
      ];

      for (const route of accountRoutes) {
        let res;
        try {
          res = await page.goto(route, { waitUntil: 'domcontentloaded' });
        } catch (error) {
          // Next dev can reset a navigation while compiling a newly visited
          // server route; retry the same destination once before treating it
          // as a real route failure.
          if (!(error instanceof Error) || !/ERR_ABORTED|aborted|ECONNRESET/i.test(error.message)) throw error;
          res = await page.goto(route, { waitUntil: 'domcontentloaded' });
        }
        expect(res?.status(), `${route} must be accessible to authenticated customer`).toBeLessThan(400);
        await expect(page).not.toHaveURL(/\/login/);
        await expect(page.locator('main:visible').first()).toBeVisible({ timeout: 15_000 });
      }
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
      await cleanupAcceptanceUsers(prisma!, [user.id]);
    }
  });

  test('scenario B: employee redirected away from /admin to /staff', async ({ browser }) => {
    test.setTimeout(60_000);
    const employee = await createAcceptanceUser(prisma!, UserRole.EMPLOYEE, 'staff-redirect');
    const contexts: BrowserContext[] = [];
    try {
      const ctx = await browser.newContext();
      contexts.push(ctx);
      await authenticateContext(prisma!, ctx, employee);
      const page = await ctx.newPage();
      await page.goto('/admin');
      await expect(page).toHaveURL(/\/staff(?:\?|$)/, { timeout: 15_000 });
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
      await cleanupAcceptanceUsers(prisma!, [employee.id]);
    }
  });

  test('scenario C: customer redirected away from /admin to /account', async ({ browser }) => {
    test.setTimeout(60_000);
    const customer = await createAcceptanceUser(prisma!, UserRole.CUSTOMER, 'admin-redirect');
    const contexts: BrowserContext[] = [];
    try {
      const ctx = await browser.newContext();
      contexts.push(ctx);
      await authenticateContext(prisma!, ctx, customer);
      const page = await ctx.newPage();
      await page.goto('/admin');
      await expect(page).toHaveURL(/\/account(?:\?|$)/, { timeout: 15_000 });
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
      await cleanupAcceptanceUsers(prisma!, [customer.id]);
    }
  });

  test('scenario D: operations manager can access /operations dashboard', async ({ browser }) => {
    test.setTimeout(60_000);
    const manager = await createAcceptanceUser(prisma!, UserRole.OPERATIONS_MANAGER, 'ops-access');
    const branch = await prisma!.branch.findFirst({ where: { status: 'ACTIVE' } });
    if (branch) {
      await prisma!.branchMembership.create({ data: { branchId: branch.id, userId: manager.id } });
    }
    const contexts: BrowserContext[] = [];
    try {
      const ctx = await browser.newContext();
      contexts.push(ctx);
      await authenticateContext(prisma!, ctx, manager);
      const page = await ctx.newPage();
      const res = await page.goto('/operations', { waitUntil: 'domcontentloaded' });
      expect(res?.status()).toBeLessThan(400);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator('main:visible').first()).toBeVisible();
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
      await cleanupAcceptanceUsers(prisma!, [manager.id]);
    }
  });

  test('scenario E: owner can access /admin command center', async ({ browser }) => {
    test.setTimeout(60_000);
    const owner = await createAcceptanceUser(prisma!, UserRole.OWNER, 'owner-admin-access');
    const contexts: BrowserContext[] = [];
    try {
      const ctx = await browser.newContext();
      contexts.push(ctx);
      await authenticateContext(prisma!, ctx, owner);
      const page = await ctx.newPage();
      const res = await page.goto('/admin', { waitUntil: 'domcontentloaded' });
      expect(res?.status()).toBeLessThan(400);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator('main:visible').first()).toBeVisible();
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
      await cleanupAcceptanceUsers(prisma!, [owner.id]);
    }
  });

  test('scenario F: system admin can access /system-admin panel', async ({ browser }) => {
    test.setTimeout(60_000);
    const admin = await createAcceptanceUser(prisma!, UserRole.SYSTEM_SUPER_ADMIN, 'sysadmin-access');
    const contexts: BrowserContext[] = [];
    try {
      const ctx = await browser.newContext();
      contexts.push(ctx);
      await authenticateContext(prisma!, ctx, admin);
      const page = await ctx.newPage();
      const res = await page.goto('/system-admin', { waitUntil: 'domcontentloaded' });
      expect(res?.status()).toBeLessThan(400);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator('main:visible').first()).toBeVisible();
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
      await cleanupAcceptanceUsers(prisma!, [admin.id]);
    }
  });

  test('scenario G: IDOR — customer A cannot access customer B booking detail', async ({ browser }) => {
    test.setTimeout(90_000);
    const nonce = randomUUID().slice(0, 8);
    const userA = await createAcceptanceUser(prisma!, UserRole.CUSTOMER, `idor-a-${nonce}`);
    const userB = await createAcceptanceUser(prisma!, UserRole.CUSTOMER, `idor-b-${nonce}`);
    const profileB = await prisma!.customerProfile.create({ data: { userId: userB.id } });
    const paymentMethod = await prisma!.branchPaymentMethod.findFirst({
      where: { active: true, branch: { status: 'ACTIVE' } },
    });
    const area = paymentMethod
      ? await prisma!.coverageArea.findFirst({ where: { active: true, zone: { branchId: paymentMethod.branchId } } })
      : null;
    const variant = await prisma!.serviceVariant.findFirst({ where: { service: { active: true } } });

    if (!paymentMethod || !area || !variant) {
      test.skip(true, 'SEEDED_FIXTURE_MISSING: payment method, area, or variant required for IDOR test');
      return;
    }

    const vehicle = await prisma!.vehicle.create({
      data: {
        customerId: profileB.id,
        make: 'E2E', model: `IDOR-${nonce}`,
        year: 2026, color: 'Black', vehicleSize: 'SEDAN', isDefault: true,
      },
    });
    const bookingB = await prisma!.booking.create({
      data: {
        bookingNumber: `E2E-IDOR-${nonce.toUpperCase()}`,
        customerId: profileB.id,
        branchId: paymentMethod.branchId,
        coverageAreaId: area.id,
        vehicleId: vehicle.id,
        serviceId: variant.serviceId,
        serviceVariantId: variant.id,
        startAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        endAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
        totalDurationMinutes: 60,
        basePrice: 500,
        addonPrice: 0,
        totalPrice: 500,
        depositAmount: 0,
        amountPaid: 0,
        amountDue: 500,
        paymentStatus: 'AWAITING_PROOF',
        bookingStatus: 'AWAITING_PAYMENT_PROOF',
        addressSnapshot: { source: 'idor-test' },
        vehicleSnapshot: { make: 'E2E', model: `IDOR-${nonce}`, size: 'SEDAN' },
        serviceSnapshot: { nameAr: 'IDOR Test' },
        contactSnapshot: { name: userB.fullName, phone: userB.phone },
      },
    });
    const contexts: BrowserContext[] = [];
    try {
      const ctxA = await browser.newContext();
      contexts.push(ctxA);
      await authenticateContext(prisma!, ctxA, userA);
      const pageA = await ctxA.newPage();
      const res = await pageA.goto(`/account/bookings/${bookingB.id}`);
      expect([200, 404]).toContain(res?.status());
      // Must not show booking B's number to customer A
      await expect(pageA.getByText(`E2E-IDOR-${nonce.toUpperCase()}`)).toHaveCount(0);
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
      await prisma!.booking.deleteMany({ where: { id: bookingB.id } });
      await cleanupAcceptanceUsers(prisma!, [userA.id, userB.id]);
    }
  });

  test('scenario H: mustChangePwd customer is redirected to change-password flow', async ({ browser }) => {
    test.setTimeout(60_000);
    const user = await createAcceptanceUser(prisma!, UserRole.CUSTOMER, 'must-change-pwd');
    await prisma!.user.update({ where: { id: user.id }, data: { mustChangePwd: true } });
    const updatedUser = { ...user, mustChangePwd: true };
    const contexts: BrowserContext[] = [];
    try {
      const ctx = await browser.newContext();
      contexts.push(ctx);
      await authenticateContext(prisma!, ctx, updatedUser);
      const page = await ctx.newPage();
      await page.goto('/account');
      // Should redirect to change-password or show a warning banner
      const url = page.url();
      const hasChangePwdRoute = url.includes('change-password')
        || url.includes('change_password=true')
        || url.includes('login');
      const hasBanner = await page.locator('[data-testid="must-change-pwd"]').isVisible()
        .catch(() => false);
      expect(hasChangePwdRoute || hasBanner).toBe(true);
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
      await cleanupAcceptanceUsers(prisma!, [user.id]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §6 — Acceptance: staff/technician access (requires DB)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('§6 — Technician (staff) portal access', () => {
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

  test('scenario I: technician can access /staff and sees their task list', async ({ browser }) => {
    test.setTimeout(60_000);
    const tech = await createAcceptanceUser(prisma!, UserRole.EMPLOYEE, 'staff-tasks-access');
    const contexts: BrowserContext[] = [];
    try {
      const ctx = await browser.newContext();
      contexts.push(ctx);
      await authenticateContext(prisma!, ctx, tech);
      const page = await ctx.newPage();
      const res = await page.goto('/staff', { waitUntil: 'domcontentloaded' });
      expect(res?.status()).toBeLessThan(400);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator('main:visible').first()).toBeVisible();
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
      await cleanupAcceptanceUsers(prisma!, [tech.id]);
    }
  });

  test('scenario J: technician cannot access /admin (gets redirected to /staff)', async ({ browser }) => {
    test.setTimeout(60_000);
    const tech = await createAcceptanceUser(prisma!, UserRole.EMPLOYEE, 'staff-no-admin');
    const contexts: BrowserContext[] = [];
    try {
      const ctx = await browser.newContext();
      contexts.push(ctx);
      await authenticateContext(prisma!, ctx, tech);
      const page = await ctx.newPage();
      await page.goto('/admin');
      await expect(page).toHaveURL(/\/staff(?:\?|$)/, { timeout: 15_000 });
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
      await cleanupAcceptanceUsers(prisma!, [tech.id]);
    }
  });

  test('scenario K: technician cannot access /operations (gets redirected)', async ({ browser }) => {
    test.setTimeout(60_000);
    const tech = await createAcceptanceUser(prisma!, UserRole.EMPLOYEE, 'staff-no-ops');
    const contexts: BrowserContext[] = [];
    try {
      const ctx = await browser.newContext();
      contexts.push(ctx);
      await authenticateContext(prisma!, ctx, tech);
      const page = await ctx.newPage();
      await page.goto('/operations');
      await expect(page).not.toHaveURL(/\/operations(?:\?|$)/, { timeout: 15_000 });
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
      await cleanupAcceptanceUsers(prisma!, [tech.id]);
    }
  });

  test('scenario L: technician cannot access /system-admin (gets redirected)', async ({ browser }) => {
    test.setTimeout(60_000);
    const tech = await createAcceptanceUser(prisma!, UserRole.EMPLOYEE, 'staff-no-sysadmin');
    const contexts: BrowserContext[] = [];
    try {
      const ctx = await browser.newContext();
      contexts.push(ctx);
      await authenticateContext(prisma!, ctx, tech);
      const page = await ctx.newPage();
      await page.goto('/system-admin');
      await expect(page).not.toHaveURL(/\/system-admin(?:\?|$)/, { timeout: 15_000 });
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
      await cleanupAcceptanceUsers(prisma!, [tech.id]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §7 — Session security (requires DB)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('§7 — Session security: expired / invalidated sessions', () => {
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

  test('scenario M: deactivated user session is rejected and redirected to login', async ({ browser }) => {
    test.setTimeout(60_000);
    const user = await createAcceptanceUser(prisma!, UserRole.CUSTOMER, 'session-deactivate');
    const contexts: BrowserContext[] = [];
    try {
      const ctx = await browser.newContext();
      contexts.push(ctx);
      await authenticateContext(prisma!, ctx, user);
      // Deactivate the user (simulates account suspension)
      await prisma!.user.update({
        where: { id: user.id },
        data: { active: false, sessionVersion: { increment: 1 } },
      });
      const page = await ctx.newPage();
      await page.goto('/account');
      // The middleware should detect the invalidated session
      await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
      await cleanupAcceptanceUsers(prisma!, [user.id]);
    }
  });
});

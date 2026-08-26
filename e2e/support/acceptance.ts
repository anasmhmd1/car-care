import type { BrowserContext } from '@playwright/test';
import {
  AssignmentMode,
  BookingStatus,
  PaymentStatus,
  PrismaClient,
  UserRole,
  VehicleSize,
  type User,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { signSessionJwt } from '../../src/lib/auth/session-token';
import { BOOKING_TERMS_VERSION } from '../../src/lib/policies/versions';

export const acceptanceDatabaseUrl = process.env.E2E_DATABASE_URL?.trim() || null;
export const acceptanceBaseURL = process.env.E2E_BASE_URL?.trim()
  || `http://localhost:${process.env.E2E_PORT?.trim() || '3000'}`;

export const VALID_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

export function createAcceptancePrisma() {
  if (!acceptanceDatabaseUrl) return null;
  return new PrismaClient({
    datasources: { db: { url: acceptanceDatabaseUrl } },
  });
}

export async function probeAcceptanceDatabase(prisma: PrismaClient | null) {
  if (!prisma) {
    return 'E2E_DATABASE_URL is missing; configure a disposable, seeded PostgreSQL database to run acceptance scenarios.';
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    return null;
  } catch {
    return 'The E2E database is unavailable; check E2E_DATABASE_URL and start PostgreSQL before running acceptance scenarios.';
  }
}

export function sessionPrerequisite() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    return 'SESSION_SECRET (at least 32 characters) is required for authenticated browser acceptance scenarios.';
  }
  return null;
}

export async function createAcceptanceUser(
  prisma: PrismaClient,
  role: UserRole,
  label: string,
) {
  const nonce = randomUUID();
  return prisma.user.create({
    data: {
      fullName: `E2E ${label} ${nonce.slice(0, 8)}`,
      phone: `e2e-${label.toLowerCase()}-${nonce}`,
      email: `e2e-${nonce}@example.invalid`,
      passwordHash: createHash('sha256').update(randomUUID()).digest('hex'),
      role,
      active: true,
      mustChangePwd: false,
    },
  });
}

export async function authenticateContext(
  prisma: PrismaClient,
  context: BrowserContext,
  user: Pick<User, 'id' | 'role' | 'sessionVersion' | 'mustChangePwd'>,
) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET is not configured for acceptance authentication');
  }

  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const token = await signSessionJwt(
    {
      sessionId,
      userId: user.id,
      role: user.role,
      sessionVersion: user.sessionVersion,
      mustChangePwd: user.mustChangePwd,
    },
    { expiresAt, secret: new TextEncoder().encode(secret) }
  );

  await prisma.session.create({
    data: {
      id: sessionId,
      userId: user.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      sessionVersion: user.sessionVersion,
      userAgent: 'Bareeq Playwright acceptance',
      expiresAt,
    },
  });
  await context.addCookies([{
    name: 'bareeq_session',
    value: token,
    url: acceptanceBaseURL,
    httpOnly: true,
    secure: acceptanceBaseURL.startsWith('https://'),
    sameSite: 'Lax',
    expires: Math.floor(expiresAt.getTime() / 1000),
  }]);
}

export interface MinimalBookingFixture {
  user: User;
  customerId: string;
  vehicleId: string;
  bookingId: string;
  bookingNumber: string;
  branchId: string;
  serviceId: string;
  serviceVariantId: string;
  coverageAreaId: string;
  paymentMethodId: string;
  teamId: string;
}

export async function createMinimalCustomerBooking(
  prisma: PrismaClient,
  label: string,
  options: {
    bookingStatus?: BookingStatus;
    paymentStatus?: PaymentStatus;
    totalPrice?: number;
    depositAmount?: number;
    amountPaid?: number;
  } = {},
): Promise<MinimalBookingFixture> {
  const paymentMethod = await prisma.branchPaymentMethod.findFirst({
    where: { active: true, branch: { status: 'ACTIVE' } },
    include: { branch: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  if (!paymentMethod) throw new Error('SEEDED_FIXTURE_MISSING: active branch payment method');

  const [area, variant, team] = await Promise.all([
    prisma.coverageArea.findFirst({
      where: { active: true, zone: { branchId: paymentMethod.branchId } },
    }),
    prisma.serviceVariant.findFirst({
      where: {
        vehicleSize: VehicleSize.SEDAN,
        service: { active: true },
      },
      include: { service: true },
    }),
    prisma.team.findFirst({
      where: { branchId: paymentMethod.branchId, active: true },
    }),
  ]);
  if (!area || !variant || !team) {
    throw new Error('SEEDED_FIXTURE_MISSING: area, sedan service variant, or team');
  }

  const user = await createAcceptanceUser(prisma, UserRole.CUSTOMER, label);
  const customer = await prisma.customerProfile.create({ data: { userId: user.id } });
  const vehicle = await prisma.vehicle.create({
    data: {
      customerId: customer.id,
      make: 'E2E',
      model: label,
      year: 2026,
      color: 'Black',
      vehicleSize: VehicleSize.SEDAN,
      isDefault: true,
    },
  });
  const totalPrice = options.totalPrice ?? 1_000;
  const amountPaid = options.amountPaid ?? 0;
  const startAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
  const bookingNumber = `E2E-${label.toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const booking = await prisma.booking.create({
    data: {
      bookingNumber,
      customerId: customer.id,
      branchId: paymentMethod.branchId,
      coverageAreaId: area.id,
      vehicleId: vehicle.id,
      serviceId: variant.serviceId,
      serviceVariantId: variant.id,
      startAt,
      endAt,
      totalDurationMinutes: 60,
      basePrice: totalPrice,
      addonPrice: 0,
      totalPrice,
      depositAmount: options.depositAmount ?? 300,
      amountPaid,
      amountDue: totalPrice - amountPaid,
      paymentStatus: options.paymentStatus ?? PaymentStatus.AWAITING_PROOF,
      bookingStatus: options.bookingStatus ?? BookingStatus.AWAITING_PAYMENT_PROOF,
      assignmentMode: paymentMethod.branch.assignmentMode ?? AssignmentMode.MANUAL,
      addressSnapshot: { source: 'playwright-acceptance' },
      vehicleSnapshot: { make: 'E2E', model: label, size: VehicleSize.SEDAN },
      serviceSnapshot: { nameAr: variant.service.nameAr },
      contactSnapshot: { name: user.fullName, phone: user.phone },
      policyVersion: BOOKING_TERMS_VERSION,
      policyAcceptedAt: new Date(),
    },
  });

  return {
    user,
    customerId: customer.id,
    vehicleId: vehicle.id,
    bookingId: booking.id,
    bookingNumber,
    branchId: paymentMethod.branchId,
    serviceId: variant.serviceId,
    serviceVariantId: variant.id,
    coverageAreaId: area.id,
    paymentMethodId: paymentMethod.id,
    teamId: team.id,
  };
}

export async function cleanupAcceptanceUsers(prisma: PrismaClient, userIds: string[]) {
  if (!userIds.length) return;
  // AuditLog is append-only by database trigger and intentionally keeps its
  // actor FK. Acceptance identities remain as inactive tombstones; their
  // randomized identities prevent collisions between runs.
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.updateMany({
    where: { id: { in: userIds } },
    data: { active: false, deletedAt: new Date(), sessionVersion: { increment: 1 } },
  });
}

export async function cleanupAcceptancePaymentRecords(
  prisma: PrismaClient,
  bookingId: string,
) {
  // A server action can finish immediately after the browser context closes.
  // Delete in FK order and retry only the transient proof/review race; the
  // final attempt still surfaces any persistent integrity error.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const proofIds = (await prisma.paymentProof.findMany({
      where: { bookingId },
      select: { id: true },
    })).map(({ id }) => id);

    await prisma.payment.deleteMany({ where: { bookingId } });
    await prisma.paymentReview.deleteMany({
      where: {
        OR: [
          { bookingId },
          ...(proofIds.length ? [{ proofId: { in: proofIds } }] : []),
        ],
      },
    });

    try {
      await prisma.paymentProof.deleteMany({ where: { id: { in: proofIds } } });
      return;
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;
      if (code !== 'P2003' || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

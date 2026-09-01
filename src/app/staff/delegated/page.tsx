import type { Metadata } from 'next';
import { BookingStatus, ProofStatus, UserRole } from '@prisma/client';
import { redirect } from 'next/navigation';
import { getAccessibleBranchIds } from '@/lib/auth/authorization';
import {
  bookingPermissionScopes,
  hasPermission,
  hasPermissionAcrossScopes,
  type PermissionCode,
} from '@/lib/auth/permissions';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import DelegatedOperationsBoard from './DelegatedOperationsBoard';

export const metadata: Metadata = {
  title: 'المهام المفوّضة | بريق',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const DELEGATED_QUEUE_PERMISSIONS = [
  'payment.review',
  'booking.accept',
  'booking.view_unassigned',
  'quality.review',
  'payment.record_balance',
  'refund.record_proof',
  'booking.close',
] as const satisfies readonly PermissionCode[];

type DelegatedQueuePermission = (typeof DELEGATED_QUEUE_PERMISSIONS)[number];

export default async function DelegatedOperationsPage() {
  const actor = await requireRole([
    UserRole.EMPLOYEE,
    UserRole.OPERATIONS_MANAGER,
    UserRole.OWNER,
  ]);
  const bookingPermissionCache = new Map<string, Promise<boolean>>();
  const hasBookingPermission = (
    permission: DelegatedQueuePermission,
    booking: { branchId: string; assignedTeamId: string | null },
  ) => {
    const cacheKey = `${permission}:${booking.branchId}:${booking.assignedTeamId ?? ''}`;
    const cached = bookingPermissionCache.get(cacheKey);
    if (cached) return cached;
    const decision = hasPermissionAcrossScopes(
      actor,
      permission,
      bookingPermissionScopes(booking),
    );
    bookingPermissionCache.set(cacheKey, decision);
    return decision;
  };
  const filterRecordsByBookingPermission = async <T,>(
    permission: DelegatedQueuePermission,
    records: T[],
    getBooking: (record: T) => { branchId: string; assignedTeamId: string | null },
  ) => {
    const decisions = await Promise.all(records.map((record) => (
      hasBookingPermission(permission, getBooking(record))
    )));
    return records.filter((_record, index) => decisions[index]);
  };
  const accessibleBranchIds = await getAccessibleBranchIds(actor);
  const branches = await db.branch.findMany({
    where: accessibleBranchIds === null ? {} : { id: { in: accessibleBranchIds } },
    orderBy: { nameAr: 'asc' },
    select: { id: true, nameAr: true, teams: { select: { id: true } } },
  });

  const permissionEntries = await Promise.all(
    DELEGATED_QUEUE_PERMISSIONS.flatMap((permission) => branches.map(async (branch) => {
      const unassignedAllowed = await hasBookingPermission(permission, {
        branchId: branch.id,
        assignedTeamId: null,
      });
      const teamPermissions = permission === 'booking.view_unassigned'
        ? []
        : await Promise.all(branch.teams.map(async (team) => (
          hasBookingPermission(permission, {
            branchId: branch.id,
            assignedTeamId: team.id,
          })
        )));
      return {
        permission,
        branchId: branch.id,
        allowed: unassignedAllowed || teamPermissions.some(Boolean),
      };
    })),
  );
  const allowedBranches = Object.fromEntries(
    DELEGATED_QUEUE_PERMISSIONS.map((permission) => [
      permission,
      permissionEntries
        .filter((entry) => entry.permission === permission && entry.allowed)
        .map((entry) => entry.branchId),
    ]),
  ) as Record<DelegatedQueuePermission, string[]>;

  const [canEditGlobalPrices, branchPricePermissions] = await Promise.all([
    hasPermission(actor, 'catalog.price.manage'),
    Promise.all(branches.map((branch) =>
      hasPermission(actor, 'catalog.price.manage', { type: 'BRANCH', id: branch.id })
    )),
  ]);
  const canManagePrices = actor.role !== UserRole.EMPLOYEE &&
    (canEditGlobalPrices || branchPricePermissions.some(Boolean));
  const enabled = Object.fromEntries(
    DELEGATED_QUEUE_PERMISSIONS.map((permission) => [
      permission,
      allowedBranches[permission].length > 0,
    ]),
  ) as Record<DelegatedQueuePermission, boolean>;

  if (!Object.values(enabled).some(Boolean) && !canManagePrices) redirect('/staff');

  const [
    pendingProofs,
    reviewBookings,
    unassignedBookings,
    qualityCandidates,
    balanceCandidates,
    closeCandidates,
    refundCasesRaw,
  ] = await Promise.all([
    enabled['payment.review']
      ? db.paymentProof.findMany({
          where: {
            status: ProofStatus.UNDER_REVIEW,
            booking: {
              deletedAt: null,
              bookingStatus: BookingStatus.PAYMENT_UNDER_REVIEW,
              branchId: { in: allowedBranches['payment.review'] },
            },
          },
          take: 100,
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            senderName: true,
            senderPhoneOrAccount: true,
            referenceNumber: true,
            amountSubmitted: true,
            transferTimestamp: true,
            proofFileUrl: true,
            paymentMethod: { select: { name: true } },
            booking: {
              select: {
                id: true,
                branchId: true,
                assignedTeamId: true,
                bookingNumber: true,
                depositAmount: true,
                amountPaid: true,
                amountDue: true,
                totalPrice: true,
                branch: { select: { nameAr: true } },
                service: { select: { nameAr: true } },
                vehicle: { select: { make: true, model: true } },
                customer: { select: { user: { select: { fullName: true } } } },
              },
            },
          },
        })
      : Promise.resolve([]),
    enabled['booking.accept']
      ? db.booking.findMany({
          where: {
            deletedAt: null,
            bookingStatus: BookingStatus.AWAITING_OPERATIONS_REVIEW,
            branchId: { in: allowedBranches['booking.accept'] },
          },
          take: 100,
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            branchId: true,
            assignedTeamId: true,
            bookingNumber: true,
            startAt: true,
            amountPaid: true,
            amountDue: true,
            branch: { select: { nameAr: true } },
            service: { select: { nameAr: true } },
            vehicle: { select: { make: true, model: true, plateNumber: true } },
            coverageArea: { select: { compound: true } },
            customer: { select: { user: { select: { fullName: true } } } },
          },
        })
      : Promise.resolve([]),
    enabled['booking.view_unassigned']
      ? db.booking.findMany({
          where: {
            deletedAt: null,
            assignedTeamId: null,
            bookingStatus: { in: [BookingStatus.ACCEPTED, BookingStatus.AWAITING_ASSIGNMENT] },
            branchId: { in: allowedBranches['booking.view_unassigned'] },
          },
          take: 100,
          orderBy: { startAt: 'asc' },
          select: {
            id: true,
            branchId: true,
            assignedTeamId: true,
            bookingNumber: true,
            bookingStatus: true,
            startAt: true,
            branch: { select: { nameAr: true } },
            service: { select: { nameAr: true } },
            vehicle: { select: { make: true, model: true, plateNumber: true } },
            coverageArea: { select: { compound: true } },
          },
        })
      : Promise.resolve([]),
    enabled['quality.review']
      ? db.booking.findMany({
          where: {
            deletedAt: null,
            bookingStatus: BookingStatus.QUALITY_REVIEW,
            branchId: { in: allowedBranches['quality.review'] },
          },
          take: 100,
          orderBy: { updatedAt: 'asc' },
          select: {
            id: true,
            branchId: true,
            assignedTeamId: true,
            bookingNumber: true,
            branch: { select: { nameAr: true } },
            service: { select: { nameAr: true } },
            assignedTeam: { select: { name: true } },
            customer: { select: { user: { select: { fullName: true } } } },
          },
        })
      : Promise.resolve([]),
    enabled['payment.record_balance']
      ? db.booking.findMany({
          where: {
            deletedAt: null,
            amountDue: { gt: 0 },
            bookingStatus: {
              in: [
                BookingStatus.IN_SERVICE,
                BookingStatus.QUALITY_REVIEW,
                BookingStatus.SERVICE_COMPLETED,
                BookingStatus.DELIVERED,
              ],
            },
            branchId: { in: allowedBranches['payment.record_balance'] },
          },
          take: 100,
          orderBy: { startAt: 'asc' },
          select: {
            id: true,
            branchId: true,
            assignedTeamId: true,
            bookingNumber: true,
            bookingStatus: true,
            amountDue: true,
            amountPaid: true,
            totalPrice: true,
            branch: { select: { nameAr: true } },
            service: { select: { nameAr: true } },
            customer: { select: { user: { select: { fullName: true } } } },
          },
        })
      : Promise.resolve([]),
    enabled['booking.close']
      ? db.booking.findMany({
          where: {
            deletedAt: null,
            bookingStatus: BookingStatus.DELIVERED,
            amountDue: 0,
            branchId: { in: allowedBranches['booking.close'] },
          },
          take: 100,
          orderBy: { updatedAt: 'asc' },
          select: {
            id: true,
            branchId: true,
            assignedTeamId: true,
            bookingNumber: true,
            branch: { select: { nameAr: true } },
            service: { select: { nameAr: true } },
            customer: { select: { user: { select: { fullName: true } } } },
          },
        })
      : Promise.resolve([]),
    enabled['refund.record_proof']
      ? db.cancellationRequest.findMany({
          where: {
            status: 'APPROVED_REFUND_PENDING',
            booking: {
              deletedAt: null,
              branchId: { in: allowedBranches['refund.record_proof'] },
            },
          },
          take: 100,
          orderBy: { updatedAt: 'asc' },
          select: {
            id: true,
            approvedRefundAmount: true,
            booking: {
              select: {
                id: true,
                branchId: true,
                assignedTeamId: true,
                bookingNumber: true,
                branch: { select: { nameAr: true } },
                service: { select: { nameAr: true } },
                customer: { select: { user: { select: { fullName: true } } } },
                refunds: {
                  where: { status: { in: ['REFUND_PROCESSING', 'REFUNDED'] } },
                  select: { amount: true },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const [
    readablePendingProofs,
    readableReviewBookings,
    readableUnassignedBookings,
    qualityBookings,
    balanceBookings,
    closeBookings,
    readableRefundCasesRaw,
  ] = await Promise.all([
    filterRecordsByBookingPermission('payment.review', pendingProofs, (proof) => proof.booking),
    filterRecordsByBookingPermission('booking.accept', reviewBookings, (booking) => booking),
    filterRecordsByBookingPermission('booking.view_unassigned', unassignedBookings, (booking) => booking),
    filterRecordsByBookingPermission('quality.review', qualityCandidates, (booking) => booking),
    filterRecordsByBookingPermission('payment.record_balance', balanceCandidates, (booking) => booking),
    filterRecordsByBookingPermission('booking.close', closeCandidates, (booking) => booking),
    filterRecordsByBookingPermission('refund.record_proof', refundCasesRaw, (request) => request.booking),
  ]);

  const refundCases = readableRefundCasesRaw.flatMap((request) => {
    const recordedAmount = request.booking.refunds.reduce(
      (total, refund) => total + refund.amount,
      0,
    );
    const remainingAmount = Math.max(
      0,
      (request.approvedRefundAmount ?? 0) - recordedAmount,
    );
    return remainingAmount > 0
      ? [{
          id: request.id,
          approvedRefundAmount: request.approvedRefundAmount ?? 0,
          remainingAmount,
          booking: {
            id: request.booking.id,
            branchId: request.booking.branchId,
            assignedTeamId: request.booking.assignedTeamId,
            bookingNumber: request.booking.bookingNumber,
            branch: request.booking.branch,
            service: request.booking.service,
            customer: request.booking.customer,
          },
        }]
      : [];
  });

  return (
    <DelegatedOperationsBoard
      enabled={enabled}
      canManagePrices={canManagePrices}
      pendingProofs={readablePendingProofs}
      reviewBookings={readableReviewBookings}
      unassignedBookings={readableUnassignedBookings}
      qualityBookings={qualityBookings}
      balanceBookings={balanceBookings}
      refundCases={refundCases}
      closeBookings={closeBookings}
    />
  );
}

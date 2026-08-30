import { FileType, UserRole } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { canAccessBranch } from '@/lib/auth/authorization';
import { hasOperationalBookingFilePermission } from '@/lib/auth/booking-file-access';
import { canEmployeeAccessTaskAssignment } from '@/lib/auth/task-assignment';
import {
  hasPermission,
  hasPermissionAcrossScopes,
  type PermissionCode,
} from '@/lib/auth/permissions';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { readUploadedFile } from '@/lib/upload';

const CUSTOMER_VISIBLE_FILE_TYPES = new Set<FileType>([
  FileType.PAYMENT_PROOF,
  FileType.BEFORE_SERVICE,
  FileType.AFTER_SERVICE,
  FileType.REFUND_PROOF,
  FileType.CANCELLATION_EVIDENCE,
  FileType.COMPLAINT_EVIDENCE,
]);
const QUALITY_REVIEW_FILE_TYPES = new Set<FileType>([
  FileType.BEFORE_SERVICE,
  FileType.EXISTING_DAMAGE,
  FileType.DURING_SERVICE,
  FileType.AFTER_SERVICE,
]);
const EMPLOYEE_TEAM_VISIBLE_FILE_TYPES = new Set<FileType>([
  FileType.BEFORE_SERVICE,
  FileType.EXISTING_DAMAGE,
  FileType.DURING_SERVICE,
  FileType.AFTER_SERVICE,
]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const user = await getCurrentUser();
  const isDownload = request.nextUrl.searchParams.get('download') === '1';

  const { path: pathSegments } = await params;
  if (pathSegments.length !== 2 || pathSegments.some((segment) => !/^[a-zA-Z0-9_.-]+$/.test(segment))) {
    return NextResponse.json({ error: 'مسار الملف غير صالح.' }, { status: 400 });
  }

  const [subDirectory, fileName] = pathSegments;
  const exactUrl = `/api/files/${subDirectory}/${fileName}`;
  const [bookingFile, subscriptionProof] = await Promise.all([
    db.bookingFile.findFirst({
      where: { fileUrl: exactUrl },
      select: {
        id: true,
        fileType: true,
        mimeType: true,
        approvedForGallery: true,
        customerGalleryConsentAt: true,
        galleryApprovedAt: true,
        booking: {
          select: {
            branchId: true,
            assignedTeamId: true,
            assignedEmployeeId: true,
            customer: { select: { userId: true } },
            assignedTeam: {
              select: { members: { where: { userId: user?.id ?? '__anonymous__' }, select: { id: true, isLeader: true } } },
            },
            branch: {
              select: {
                id: true,
                memberships: { where: { userId: user?.id ?? '__anonymous__' }, select: { id: true } },
              },
            },
          },
        },
      },
    }),
    db.subscriptionPaymentProof.findFirst({
      where: { proofFileUrl: exactUrl },
      select: {
        id: true,
        mimeType: true,
        subscription: {
          select: {
            customer: { select: { userId: true } },
            branch: {
              select: {
                id: true,
                memberships: { where: { userId: user?.id ?? '__anonymous__' }, select: { id: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  // Fail closed: a physical file without a database record is never served.
  if (!bookingFile && !subscriptionProof) {
    return NextResponse.json({ error: 'الملف غير موجود.' }, { status: 404 });
  }

  if (subscriptionProof) {
    if (!user || !user.active || user.deletedAt) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول بحساب نشط.' }, { status: 401 });
    }
    const ownsSubscription = subscriptionProof.subscription.customer.userId === user.id;
    const managesBranch = Boolean(subscriptionProof.subscription.branch.memberships.length);
    const canManageSubscriptions = (
      user.role === UserRole.OPERATIONS_MANAGER ||
      user.role === UserRole.SYSTEM_SUPER_ADMIN
    )
      && (managesBranch || await canAccessBranch(user, subscriptionProof.subscription.branch.id))
      && await hasPermission(user, 'subscription.manage', {
        type: 'BRANCH',
        id: subscriptionProof.subscription.branch.id,
      });
    const authorized =
      (user.role === UserRole.CUSTOMER && ownsSubscription)
      || canManageSubscriptions
      || user.role === UserRole.OWNER;
    if (!authorized) {
      return NextResponse.json({ error: 'غير مصرح بالوصول إلى هذا الملف.' }, { status: 403 });
    }

    const fileData = await readUploadedFile(subDirectory, fileName);
    if (!fileData) return NextResponse.json({ error: 'الملف غير موجود.' }, { status: 404 });
    return new NextResponse(new Uint8Array(fileData.buffer), {
      status: 200,
      headers: {
        'Content-Type': subscriptionProof.mimeType || fileData.mimeType,
        'Content-Length': String(fileData.buffer.length),
        'Content-Disposition': isDownload ? `attachment; filename="${fileName}"` : `inline; filename="${fileName}"`,
        'Cache-Control': 'private, no-store',
        Vary: 'Cookie',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  if (!bookingFile) return NextResponse.json({ error: 'الملف غير موجود.' }, { status: 404 });

  const isPublicGalleryFile = bookingFile.approvedForGallery &&
    Boolean(bookingFile.customerGalleryConsentAt) &&
    Boolean(bookingFile.galleryApprovedAt) &&
    bookingFile.mimeType.startsWith('image/') &&
    (bookingFile.fileType === FileType.BEFORE_SERVICE || bookingFile.fileType === FileType.AFTER_SERVICE);

  if (!isPublicGalleryFile && (!user || !user.active || user.deletedAt)) {
    return NextResponse.json({ error: 'يجب تسجيل الدخول بحساب نشط.' }, { status: 401 });
  }

  const ownsBooking = bookingFile.booking.customer.userId === user?.id;
  const teamMember = bookingFile.booking.assignedTeam?.members[0];
  const hasDirectEmployeeTaskAccess = Boolean(user) && canEmployeeAccessTaskAssignment({
    employeeId: user?.id ?? '',
    assignedEmployeeId: bookingFile.booking.assignedEmployeeId,
    isTeamMember: Boolean(teamMember),
    isTeamLeader: Boolean(teamMember?.isLeader),
  });
  const managesBranch = Boolean(bookingFile.booking.branch.memberships.length);
  let hasEmployeeTaskExecutePermission = false;
  if (
    user?.role === UserRole.EMPLOYEE &&
    EMPLOYEE_TEAM_VISIBLE_FILE_TYPES.has(bookingFile.fileType)
  ) {
    hasEmployeeTaskExecutePermission = await hasPermissionAcrossScopes(user, 'task.execute', [
      { type: 'BRANCH', id: bookingFile.booking.branchId },
      ...(bookingFile.booking.assignedTeamId
        ? [{ type: 'TEAM' as const, id: bookingFile.booking.assignedTeamId }]
        : []),
    ]);
  }
  let delegatedEmployeeAccess = false;
  if (
    user?.role === UserRole.EMPLOYEE &&
    await canAccessBranch(user, bookingFile.booking.branchId)
  ) {
    let delegatedPermission: PermissionCode | null = null;
    if (bookingFile.fileType === FileType.PAYMENT_PROOF) {
      delegatedPermission = 'payment.review';
    } else if (QUALITY_REVIEW_FILE_TYPES.has(bookingFile.fileType)) {
      delegatedPermission = 'quality.review';
    } else if (bookingFile.fileType === FileType.REFUND_PROOF) {
      delegatedPermission = 'refund.record_proof';
    }
    delegatedEmployeeAccess = Boolean(
      delegatedPermission &&
      await hasPermissionAcrossScopes(user, delegatedPermission, [
        { type: 'BRANCH', id: bookingFile.booking.branchId },
        ...(bookingFile.booking.assignedTeamId
          ? [{ type: 'TEAM' as const, id: bookingFile.booking.assignedTeamId }]
          : []),
      ]),
    );
  }
  const canOperationsManagerRead = Boolean(
    user
    && user.role === UserRole.OPERATIONS_MANAGER
    && managesBranch
    && await hasOperationalBookingFilePermission(user, {
      fileType: bookingFile.fileType,
      branchId: bookingFile.booking.branchId,
      assignedTeamId: bookingFile.booking.assignedTeamId,
    }),
  );
  const authorized = isPublicGalleryFile || Boolean(user && (
    (user.role === UserRole.CUSTOMER && ownsBooking && CUSTOMER_VISIBLE_FILE_TYPES.has(bookingFile.fileType)) ||
    (user.role === UserRole.EMPLOYEE && (
      (hasDirectEmployeeTaskAccess && hasEmployeeTaskExecutePermission && EMPLOYEE_TEAM_VISIBLE_FILE_TYPES.has(bookingFile.fileType)) ||
      delegatedEmployeeAccess
    )) ||
    canOperationsManagerRead ||
    user.role === UserRole.OWNER ||
    user.role === UserRole.SYSTEM_SUPER_ADMIN
  ));

  if (!authorized) {
    return NextResponse.json({ error: 'غير مصرح بالوصول إلى هذا الملف.' }, { status: 403 });
  }

  const fileData = await readUploadedFile(subDirectory, fileName);
  if (!fileData) return NextResponse.json({ error: 'الملف غير موجود.' }, { status: 404 });

  return new NextResponse(new Uint8Array(fileData.buffer), {
    status: 200,
    headers: {
      'Content-Type': bookingFile.mimeType || fileData.mimeType,
      'Content-Length': String(fileData.buffer.length),
      'Content-Disposition': isDownload ? `attachment; filename="${fileName}"` : `inline; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
      Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

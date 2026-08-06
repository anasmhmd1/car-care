import { FileType, UserRole } from '@prisma/client';
import {
  bookingPermissionScopes,
  hasPermissionAcrossScopes,
  type PermissionCode,
  type PermissionScope,
} from '@/lib/auth/permissions';

export interface BookingFileAccessTarget {
  fileType: FileType;
  branchId: string;
  assignedTeamId?: string | null;
}

const OPERATIONAL_FILE_PERMISSIONS: Record<FileType, readonly PermissionCode[]> = {
  [FileType.PAYMENT_PROOF]: ['payment.review'],
  [FileType.BEFORE_SERVICE]: ['quality.review'],
  [FileType.EXISTING_DAMAGE]: ['quality.review'],
  [FileType.DURING_SERVICE]: ['quality.review'],
  [FileType.AFTER_SERVICE]: ['quality.review'],
  [FileType.REFUND_PROOF]: ['refund.record_proof', 'refund.approve'],
  [FileType.CANCELLATION_EVIDENCE]: ['cancellation.review'],
  [FileType.COMPLAINT_EVIDENCE]: ['complaint.manage'],
};

export function bookingFilePermissionScopes(
  target: Pick<BookingFileAccessTarget, 'branchId' | 'assignedTeamId'>,
): PermissionScope[] {
  return bookingPermissionScopes(target);
}

export function bookingFileOperationalPermissions(fileType: FileType) {
  return OPERATIONAL_FILE_PERMISSIONS[fileType];
}

/**
 * Resolves the exact operational permission required to read a booking file.
 * The caller still owns resource-membership checks. All booking scopes are
 * evaluated together, so a branch or team DENY wins over another scope's grant.
 */
export async function hasOperationalBookingFilePermission(
  actor: { id: string; role: UserRole },
  target: BookingFileAccessTarget,
) {
  if (
    actor.role === UserRole.OWNER
    || actor.role === UserRole.SYSTEM_SUPER_ADMIN
  ) {
    return true;
  }
  if (actor.role !== UserRole.OPERATIONS_MANAGER) return false;

  const scopes = bookingFilePermissionScopes(target);
  const decisions = await Promise.all(
    bookingFileOperationalPermissions(target.fileType).map((permission) => (
      hasPermissionAcrossScopes(actor, permission, scopes)
    )),
  );
  return decisions.some(Boolean);
}

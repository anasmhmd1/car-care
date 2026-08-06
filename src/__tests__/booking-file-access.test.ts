import { describe, expect, it } from 'vitest';
import { FileType } from '@prisma/client';
import {
  bookingFileOperationalPermissions,
  bookingFilePermissionScopes,
} from '@/lib/auth/booking-file-access';

describe('booking file access policy', () => {
  it('maps each sensitive booking file type to its exact operational permission', () => {
    expect(bookingFileOperationalPermissions(FileType.PAYMENT_PROOF)).toEqual(['payment.review']);
    expect(bookingFileOperationalPermissions(FileType.BEFORE_SERVICE)).toEqual(['quality.review']);
    expect(bookingFileOperationalPermissions(FileType.EXISTING_DAMAGE)).toEqual(['quality.review']);
    expect(bookingFileOperationalPermissions(FileType.DURING_SERVICE)).toEqual(['quality.review']);
    expect(bookingFileOperationalPermissions(FileType.AFTER_SERVICE)).toEqual(['quality.review']);
    expect(bookingFileOperationalPermissions(FileType.REFUND_PROOF)).toEqual([
      'refund.record_proof',
      'refund.approve',
    ]);
    expect(bookingFileOperationalPermissions(FileType.CANCELLATION_EVIDENCE)).toEqual([
      'cancellation.review',
    ]);
    expect(bookingFileOperationalPermissions(FileType.COMPLAINT_EVIDENCE)).toEqual([
      'complaint.manage',
    ]);
  });

  it('includes both branch and assigned-team scopes so a deny in either scope applies', () => {
    expect(bookingFilePermissionScopes({
      branchId: 'branch-a',
      assignedTeamId: 'team-a',
    })).toEqual([
      { type: 'BRANCH', id: 'branch-a' },
      { type: 'TEAM', id: 'team-a' },
    ]);
  });
});

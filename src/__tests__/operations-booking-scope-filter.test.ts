import { describe, expect, it } from 'vitest';
import { PermissionEffect, UserRole } from '@prisma/client';
import {
  bookingPermissionWhere,
  canAccessBookingWithPermission,
} from '@/app/operations/booking-scope-filter';

describe('operations booking scope filter', () => {
  it('keeps the team deny ahead of an operations-manager default or branch grant', () => {
    const input = {
      role: UserRole.OPERATIONS_MANAGER,
      permission: 'booking.reschedule' as const,
      overrides: [
        {
          effect: PermissionEffect.GRANT,
          scopeType: 'BRANCH',
          scopeId: 'branch-a',
          expiresAt: null,
        },
        {
          effect: PermissionEffect.DENY,
          scopeType: 'TEAM',
          scopeId: 'team-a',
          expiresAt: null,
        },
      ],
    };

    expect(canAccessBookingWithPermission({
      ...input,
      booking: { branchId: 'branch-a', assignedTeamId: 'team-a' },
    })).toBe(false);
    expect(canAccessBookingWithPermission({
      ...input,
      booking: { branchId: 'branch-a', assignedTeamId: 'team-b' },
    })).toBe(true);
  });

  it('requires a scoped grant when the role has no default permission', () => {
    const input = {
      role: UserRole.EMPLOYEE,
      permission: 'payment.review' as const,
      overrides: [
        {
          effect: PermissionEffect.GRANT,
          scopeType: 'BRANCH',
          scopeId: 'branch-a',
          expiresAt: null,
        },
      ],
    };

    expect(canAccessBookingWithPermission({
      ...input,
      booking: { branchId: 'branch-a', assignedTeamId: null },
    })).toBe(true);
    expect(canAccessBookingWithPermission({
      ...input,
      booking: { branchId: 'branch-b', assignedTeamId: null },
    })).toBe(false);
  });

  it('builds a database predicate that grants before pagination and excludes every denied scope', () => {
    expect(bookingPermissionWhere({
      role: UserRole.EMPLOYEE,
      permission: 'payment.review',
      overrides: [
        { effect: PermissionEffect.GRANT, scopeType: 'BRANCH', scopeId: 'branch-a', expiresAt: null },
        { effect: PermissionEffect.GRANT, scopeType: 'TEAM', scopeId: 'team-a', expiresAt: null },
        { effect: PermissionEffect.DENY, scopeType: 'BRANCH', scopeId: 'branch-b', expiresAt: null },
        { effect: PermissionEffect.DENY, scopeType: 'TEAM', scopeId: 'team-b', expiresAt: null },
      ],
    })).toEqual({
      AND: [
        {
          OR: [
            { branchId: { in: ['branch-a'] } },
            { assignedTeamId: { in: ['team-a'] } },
          ],
        },
        {
          NOT: {
            OR: [
              { branchId: { in: ['branch-b'] } },
              { assignedTeamId: { in: ['team-b'] } },
            ],
          },
        },
      ],
    });
  });

  it('turns a global deny into an impossible booking predicate', () => {
    expect(bookingPermissionWhere({
      role: UserRole.OWNER,
      permission: 'quality.review',
      overrides: [
        {
          effect: PermissionEffect.DENY,
          scopeType: 'GLOBAL',
          scopeId: 'GLOBAL',
          expiresAt: null,
        },
      ],
    })).toEqual({ id: { in: [] } });
  });
});

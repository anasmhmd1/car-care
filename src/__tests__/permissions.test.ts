import { describe, expect, it } from 'vitest';
import { PermissionEffect, UserRole } from '@prisma/client';
import {
  bookingPermissionScopes,
  canRoleReceivePermission,
  resolvePermissionDecision,
  roleHasDefaultPermission,
  selectExplicitPermissionEffect,
  selectExplicitPermissionEffectForScopes,
} from '@/lib/auth/permissions';

describe('permission resolution', () => {
  it('includes the assigned team with the booking branch for scoped permissions', () => {
    expect(bookingPermissionScopes({
      branchId: 'branch-a',
      assignedTeamId: 'team-a',
    })).toEqual([
      { type: 'BRANCH', id: 'branch-a' },
      { type: 'TEAM', id: 'team-a' },
    ]);
    expect(bookingPermissionScopes({ branchId: 'branch-a' })).toEqual([
      { type: 'BRANCH', id: 'branch-a' },
    ]);
  });

  it('gives owners brand-wide operational permissions by default', () => {
    expect(roleHasDefaultPermission(UserRole.OWNER, 'refund.approve')).toBe(true);
    expect(roleHasDefaultPermission(UserRole.OWNER, 'reports.revenue')).toBe(true);
  });

  it('does not give employees financial permissions by default', () => {
    expect(roleHasDefaultPermission(UserRole.EMPLOYEE, 'payment.review')).toBe(false);
    expect(roleHasDefaultPermission(UserRole.EMPLOYEE, 'booking.view_unassigned')).toBe(false);
    expect(roleHasDefaultPermission(UserRole.EMPLOYEE, 'booking.close')).toBe(false);
    expect(roleHasDefaultPermission(UserRole.EMPLOYEE, 'refund.record_proof')).toBe(false);
    expect(roleHasDefaultPermission(UserRole.EMPLOYEE, 'task.execute')).toBe(true);
  });

  it('keeps unassigned visibility and closing in the operations baseline', () => {
    expect(roleHasDefaultPermission(UserRole.OPERATIONS_MANAGER, 'booking.view_unassigned')).toBe(true);
    expect(roleHasDefaultPermission(UserRole.OPERATIONS_MANAGER, 'booking.close')).toBe(true);
    expect(roleHasDefaultPermission(UserRole.OPERATIONS_MANAGER, 'booking.override_close')).toBe(true);
    expect(roleHasDefaultPermission(UserRole.OPERATIONS_MANAGER, 'catalog.price.manage')).toBe(false);
  });

  it('keeps employee-account management optional while team management stays in the manager baseline', () => {
    expect(roleHasDefaultPermission(UserRole.OPERATIONS_MANAGER, 'employee.manage')).toBe(false);
    expect(roleHasDefaultPermission(UserRole.OPERATIONS_MANAGER, 'workforce.manage')).toBe(true);
    expect(roleHasDefaultPermission(UserRole.OPERATIONS_MANAGER, 'audit.view')).toBe(true);
  });

  it('never makes price management grantable to an employee role', () => {
    expect(canRoleReceivePermission(UserRole.EMPLOYEE, 'catalog.price.manage')).toBe(false);
    expect(canRoleReceivePermission(UserRole.EMPLOYEE, 'booking.assign')).toBe(false);
    expect(canRoleReceivePermission(UserRole.EMPLOYEE, 'complaint.manage')).toBe(false);
    expect(canRoleReceivePermission(UserRole.EMPLOYEE, 'employee.manage')).toBe(false);
    expect(canRoleReceivePermission(UserRole.EMPLOYEE, 'audit.view')).toBe(false);
    expect(canRoleReceivePermission(UserRole.EMPLOYEE, 'booking.override_close')).toBe(false);
    expect(canRoleReceivePermission(UserRole.OPERATIONS_MANAGER, 'catalog.price.manage')).toBe(true);
    expect(canRoleReceivePermission(UserRole.EMPLOYEE, 'refund.record_proof')).toBe(true);
  });

  it('lets an explicit grant enable a narrowly delegated permission', () => {
    expect(resolvePermissionDecision({
      role: UserRole.EMPLOYEE,
      permission: 'payment.review',
      explicitEffect: PermissionEffect.GRANT,
    })).toBe(true);
  });

  it('makes an explicit deny win over owner defaults and role configuration', () => {
    expect(resolvePermissionDecision({
      role: UserRole.OWNER,
      permission: 'reports.revenue',
      explicitEffect: PermissionEffect.DENY,
      configuredRolePermissions: ['*'],
    })).toBe(false);
  });

  it('honors a role-level boolean override', () => {
    expect(resolvePermissionDecision({
      role: UserRole.OPERATIONS_MANAGER,
      permission: 'reports.revenue',
      configuredRolePermissions: { 'reports.revenue': false },
    })).toBe(false);
  });

  it('ignores expired overrides and overrides from a different branch', () => {
    const effect = selectExplicitPermissionEffect({
      scope: { type: 'BRANCH', id: 'branch-a' },
      now: new Date('2026-08-01T12:00:00Z'),
      overrides: [
        { effect: PermissionEffect.DENY, scopeType: 'BRANCH', scopeId: 'branch-b', expiresAt: null },
        { effect: PermissionEffect.DENY, scopeType: 'BRANCH', scopeId: 'branch-a', expiresAt: new Date('2026-07-01T00:00:00Z') },
      ],
    });
    expect(effect).toBeUndefined();
  });

  it('makes any active applicable deny win over a grant', () => {
    const effect = selectExplicitPermissionEffect({
      scope: { type: 'BRANCH', id: 'branch-a' },
      overrides: [
        { effect: PermissionEffect.GRANT, scopeType: 'BRANCH', scopeId: 'branch-a', expiresAt: null },
        { effect: PermissionEffect.DENY, scopeType: 'GLOBAL', scopeId: 'GLOBAL', expiresAt: null },
      ],
    });
    expect(effect).toBe(PermissionEffect.DENY);
  });

  it('makes a branch deny win over a team grant for the same booking', () => {
    const effect = selectExplicitPermissionEffectForScopes({
      scopes: [
        { type: 'BRANCH', id: 'branch-a' },
        { type: 'TEAM', id: 'team-a' },
      ],
      overrides: [
        { effect: PermissionEffect.DENY, scopeType: 'BRANCH', scopeId: 'branch-a', expiresAt: null },
        { effect: PermissionEffect.GRANT, scopeType: 'TEAM', scopeId: 'team-a', expiresAt: null },
      ],
    });
    expect(effect).toBe(PermissionEffect.DENY);
  });

  it('blocks employee task execution when a booking branch denies it despite a team grant', () => {
    const explicitEffect = selectExplicitPermissionEffectForScopes({
      scopes: [
        { type: 'BRANCH', id: 'branch-a' },
        { type: 'TEAM', id: 'team-a' },
      ],
      overrides: [
        { effect: PermissionEffect.DENY, scopeType: 'BRANCH', scopeId: 'branch-a', expiresAt: null },
        { effect: PermissionEffect.GRANT, scopeType: 'TEAM', scopeId: 'team-a', expiresAt: null },
      ],
    });
    expect(resolvePermissionDecision({
      role: UserRole.EMPLOYEE,
      permission: 'task.execute',
      explicitEffect,
    })).toBe(false);
  });

  it('blocks employee task execution when the assigned team denies it despite a branch grant', () => {
    const explicitEffect = selectExplicitPermissionEffectForScopes({
      scopes: [
        { type: 'BRANCH', id: 'branch-a' },
        { type: 'TEAM', id: 'team-a' },
      ],
      overrides: [
        { effect: PermissionEffect.GRANT, scopeType: 'BRANCH', scopeId: 'branch-a', expiresAt: null },
        { effect: PermissionEffect.DENY, scopeType: 'TEAM', scopeId: 'team-a', expiresAt: null },
      ],
    });
    expect(resolvePermissionDecision({
      role: UserRole.EMPLOYEE,
      permission: 'task.execute',
      explicitEffect,
    })).toBe(false);
  });

  it('blocks employee task execution when a global deny applies to the booking', () => {
    const explicitEffect = selectExplicitPermissionEffectForScopes({
      scopes: [
        { type: 'BRANCH', id: 'branch-a' },
        { type: 'TEAM', id: 'team-a' },
      ],
      overrides: [
        { effect: PermissionEffect.GRANT, scopeType: 'BRANCH', scopeId: 'branch-a', expiresAt: null },
        { effect: PermissionEffect.GRANT, scopeType: 'TEAM', scopeId: 'team-a', expiresAt: null },
        { effect: PermissionEffect.DENY, scopeType: 'GLOBAL', scopeId: 'GLOBAL', expiresAt: null },
      ],
    });
    expect(resolvePermissionDecision({
      role: UserRole.EMPLOYEE,
      permission: 'task.execute',
      explicitEffect,
    })).toBe(false);
  });

  it('makes a team task-execution deny override the operations-manager default', () => {
    const explicitEffect = selectExplicitPermissionEffectForScopes({
      scopes: [
        { type: 'BRANCH', id: 'branch-a' },
        { type: 'TEAM', id: 'team-a' },
      ],
      overrides: [
        { effect: PermissionEffect.DENY, scopeType: 'TEAM', scopeId: 'team-a', expiresAt: null },
      ],
    });
    expect(resolvePermissionDecision({
      role: UserRole.OPERATIONS_MANAGER,
      permission: 'task.execute',
      explicitEffect,
    })).toBe(false);
  });

  it('makes an assigned-team deny block booking operations permissions', () => {
    const explicitEffect = selectExplicitPermissionEffectForScopes({
      scopes: bookingPermissionScopes({
        branchId: 'branch-a',
        assignedTeamId: 'team-a',
      }),
      overrides: [
        { effect: PermissionEffect.DENY, scopeType: 'TEAM', scopeId: 'team-a', expiresAt: null },
      ],
    });
    expect(resolvePermissionDecision({
      role: UserRole.OPERATIONS_MANAGER,
      permission: 'booking.reschedule',
      explicitEffect,
    })).toBe(false);
  });
});

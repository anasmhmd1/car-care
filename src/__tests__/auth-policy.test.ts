import { describe, expect, it } from 'vitest';
import {
  canAccessRoute,
  canManageWorkforceAccount,
  getHomeRouteForRole,
  isAppRole,
  isProtectedRoute,
  isWorkforceAccountWithinManagedBranches,
} from '@/lib/auth/policy';
import { sanitizeClientData, toPublicUser } from '@/lib/auth/authorization';
import { UserRole } from '@prisma/client';

describe('authorization policy', () => {
  it('enforces the five role route boundaries', () => {
    expect(canAccessRoute('SYSTEM_SUPER_ADMIN', '/system-admin')).toBe(true);
    expect(canAccessRoute('OWNER', '/system-admin')).toBe(false);
    expect(canAccessRoute('OPERATIONS_MANAGER', '/admin')).toBe(false);
    expect(canAccessRoute('OWNER', '/operations')).toBe(true);
    expect(canAccessRoute('EMPLOYEE', '/staff/tasks')).toBe(true);
    expect(canAccessRoute('EMPLOYEE', '/staff/delegated')).toBe(true);
    expect(canAccessRoute('EMPLOYEE', '/operations/pricing')).toBe(false);
    expect(canAccessRoute('OPERATIONS_MANAGER', '/operations/pricing')).toBe(true);
    expect(canAccessRoute('SYSTEM_SUPER_ADMIN', '/staff')).toBe(false);
    expect(canAccessRoute('CUSTOMER', '/account/bookings')).toBe(true);
    expect(canAccessRoute('OWNER', '/account')).toBe(false);
    expect(canAccessRoute('OWNER', '/account/profile')).toBe(true);
    expect(canAccessRoute('EMPLOYEE', '/account/profile')).toBe(true);
  });

  it('matches complete route segments and leaves public routes public', () => {
    expect(isProtectedRoute('/admin')).toBe(true);
    expect(isProtectedRoute('/admin/settings')).toBe(true);
    expect(isProtectedRoute('/administrator')).toBe(false);
    expect(canAccessRoute('CUSTOMER', '/services')).toBe(true);
  });

  it('maps each role to its own dashboard', () => {
    expect(getHomeRouteForRole('SYSTEM_SUPER_ADMIN')).toBe('/system-admin');
    expect(getHomeRouteForRole('OWNER')).toBe('/admin');
    expect(getHomeRouteForRole('OPERATIONS_MANAGER')).toBe('/operations');
    expect(getHomeRouteForRole('EMPLOYEE')).toBe('/staff');
    expect(getHomeRouteForRole('CUSTOMER')).toBe('/account');
  });

  it('prevents workforce actions from escalating privileged roles', () => {
    expect(canManageWorkforceAccount('OWNER', 'EMPLOYEE', 'OPERATIONS_MANAGER')).toBe(true);
    expect(canManageWorkforceAccount('OWNER', 'OWNER', 'EMPLOYEE')).toBe(false);
    expect(canManageWorkforceAccount('OPERATIONS_MANAGER', 'EMPLOYEE', 'EMPLOYEE')).toBe(true);
    expect(canManageWorkforceAccount('OPERATIONS_MANAGER', 'EMPLOYEE', 'OPERATIONS_MANAGER')).toBe(false);
    expect(canManageWorkforceAccount('SYSTEM_SUPER_ADMIN', 'OWNER')).toBe(false);
  });

  it('blocks workforce IDOR through an account shared with an unmanaged branch', () => {
    const managedBranches = new Set(['branch-a', 'branch-b']);
    expect(isWorkforceAccountWithinManagedBranches(['branch-a'], managedBranches)).toBe(true);
    expect(isWorkforceAccountWithinManagedBranches(['branch-a', 'branch-b'], managedBranches)).toBe(true);
    expect(isWorkforceAccountWithinManagedBranches(['branch-a', 'branch-secret'], managedBranches)).toBe(false);
    expect(isWorkforceAccountWithinManagedBranches([], managedBranches)).toBe(false);
    expect(isWorkforceAccountWithinManagedBranches(['branch-secret'], null)).toBe(true);
  });

  it('rejects forged role strings', () => {
    expect(isAppRole('OWNER')).toBe(true);
    expect(isAppRole('SUPER_OWNER')).toBe(false);
    expect(isAppRole(null)).toBe(false);
  });
});

describe('client-safe user serialization', () => {
  const now = new Date('2026-08-01T00:00:00.000Z');
  const user = {
    id: 'user-1',
    fullName: 'Test User',
    phone: '01000000000',
    whatsapp: null,
    email: 'test@example.com',
    passwordHash: 'never-send-this',
    role: UserRole.CUSTOMER,
    active: true,
    mustChangePwd: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  it('creates an explicit public user DTO', () => {
    const publicUser = toPublicUser(user);
    expect(publicUser).toMatchObject({ id: 'user-1', role: UserRole.CUSTOMER });
    expect(publicUser).not.toHaveProperty('passwordHash');
    expect(publicUser).not.toHaveProperty('deletedAt');
  });

  it('removes sensitive hashes recursively from relation payloads', () => {
    const payload = {
      customer: { user },
      reset: { tempPasswordHash: 'also-secret' },
      createdAt: now,
    };

    const safe = sanitizeClientData(payload);
    expect(safe.customer.user).not.toHaveProperty('passwordHash');
    expect(safe.reset).not.toHaveProperty('tempPasswordHash');
    expect(safe.createdAt).toBe(now);
  });
});

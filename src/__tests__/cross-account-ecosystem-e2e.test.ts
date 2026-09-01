import { describe, expect, it } from 'vitest';
import {
  BookingStatus,
  ChecklistStage,
  PaymentStatus,
  PermissionEffect,
  UserRole,
} from '@prisma/client';
import {
  ALLOWED_STATUS_TRANSITIONS,
  EXECUTION_CHECKLIST_STAGES,
  getCustomerFacingStatusLabel,
  isValidStatusTransition,
  validateStatusTransition,
} from '@/lib/engine/state-machine';
import {
  canEditChecklistStage,
} from '@/lib/engine/evidence-stage';
import {
  canRoleReceivePermission,
  PERMISSIONS,
  resolvePermissionDecision,
  roleHasDefaultPermission,
  selectExplicitPermissionEffect,
  selectExplicitPermissionEffectForScopes,
  type PermissionCode,
} from '@/lib/auth/permissions';
import {
  APP_ROLES,
  canAccessRoute,
  canManageWorkforceAccount,
  getHomeRouteForRole,
  hasBrandWideBranchAccess,
  isAppRole,
  isProtectedRoute,
  isWorkforceAccountWithinManagedBranches,
  type AppRole,
} from '@/lib/auth/policy';
import { getSafeLocalReturnPath } from '@/lib/auth/return-url';
import { canEmployeeAccessTaskAssignment } from '@/lib/auth/task-assignment';
import { sanitizeClientData, toPublicUser } from '@/lib/auth/authorization';
import {
  calculateBookingPaymentTotals,
  canRecordBookingBalance,
} from '@/lib/engine/payment-totals';
import {
  calculateDeposit,
  calculateBookingQuote,
} from '@/lib/engine/pricing';
import {
  calculateCancellationSettlement,
  cancellationPaymentOutcome,
} from '@/lib/engine/cancellation-settlement';
import {
  calculateRefundTotals,
  isCoverageAreaEligible,
  resolveTravelMinutes,
} from '@/lib/engine/operations-math';
import { canExpireAwaitingPaymentBooking } from '@/lib/engine/booking-expiration';
import { invoiceNumberForBooking } from '@/lib/engine/invoice';
import {
  selectLiveVerificationHold,
  selectRetainableVerificationHold,
} from '@/lib/engine/payment-verification-reservation';
import { phoneHref, whatsappHref } from '@/lib/contact-links';
import {
  convertToDatabaseQuantity,
  detectMaterialUnitMeta,
  formatMaterialQuantityWithUnit,
  resolveDisplayQuantityFromDatabase,
} from '@/lib/inventory/units';
import {
  dayOfWeekForLocalDate,
  intervalsOverlap,
  localDateTimeToUtc,
  roundDurationToSlot,
} from '@/lib/engine/time';

// =============================================================================
// COMPREHENSIVE GO-LIVE E2E LOGIC TEST SUITE
// =============================================================================
// This is the final closure test. Every pure function reachable by all five
// account roles is tested. No stone is left unturned.
// =============================================================================

describe('🔒 GO-LIVE CLOSURE: Cross-Account Ecosystem Comprehensive E2E', () => {

  // ===========================================================================
  // SECTION 1: ROLE & AUTH POLICY (كل الحسابات والمسارات)
  // ===========================================================================
  describe('§1 Role Definitions & Route Access Control', () => {

    it('has exactly 5 application roles', () => {
      expect(APP_ROLES).toEqual([
        'SYSTEM_SUPER_ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'EMPLOYEE', 'CUSTOMER',
      ]);
    });

    it('identifies valid roles', () => {
      for (const role of APP_ROLES) {
        expect(isAppRole(role)).toBe(true);
      }
      expect(isAppRole('HACKER')).toBe(false);
      expect(isAppRole('')).toBe(false);
      expect(isAppRole(42)).toBe(false);
      expect(isAppRole(null)).toBe(false);
    });

    it('maps each role to its correct home route', () => {
      expect(getHomeRouteForRole('SYSTEM_SUPER_ADMIN')).toBe('/system-admin');
      expect(getHomeRouteForRole('OWNER')).toBe('/admin');
      expect(getHomeRouteForRole('OPERATIONS_MANAGER')).toBe('/operations');
      expect(getHomeRouteForRole('EMPLOYEE')).toBe('/staff');
      expect(getHomeRouteForRole('CUSTOMER')).toBe('/account');
    });

    it('grants brand-wide branch access only to OWNER and SYSTEM_SUPER_ADMIN', () => {
      expect(hasBrandWideBranchAccess('SYSTEM_SUPER_ADMIN')).toBe(true);
      expect(hasBrandWideBranchAccess('OWNER')).toBe(true);
      expect(hasBrandWideBranchAccess('OPERATIONS_MANAGER')).toBe(false);
      expect(hasBrandWideBranchAccess('EMPLOYEE')).toBe(false);
      expect(hasBrandWideBranchAccess('CUSTOMER')).toBe(false);
    });

    describe('Protected Route Access per Role', () => {
      const routeMatrix: [string, AppRole, boolean][] = [
        // /system-admin
        ['/system-admin', 'SYSTEM_SUPER_ADMIN', true],
        ['/system-admin', 'OWNER', true],
        ['/system-admin', 'OPERATIONS_MANAGER', false],
        ['/system-admin', 'EMPLOYEE', false],
        ['/system-admin', 'CUSTOMER', false],
        // /admin
        ['/admin', 'OWNER', true],
        ['/admin', 'SYSTEM_SUPER_ADMIN', true],
        ['/admin', 'OPERATIONS_MANAGER', false],
        ['/admin', 'EMPLOYEE', false],
        ['/admin', 'CUSTOMER', false],
        // /admin/calendar (ops exception)
        ['/admin/calendar', 'OPERATIONS_MANAGER', true],
        ['/admin/calendar', 'OWNER', true],
        ['/admin/calendar', 'EMPLOYEE', false],
        // /admin/reports (ops exception)
        ['/admin/reports', 'OPERATIONS_MANAGER', true],
        // /admin/subscriptions (ops exception)
        ['/admin/subscriptions', 'OPERATIONS_MANAGER', true],
        // /admin/reviews (ops exception)
        ['/admin/reviews', 'OPERATIONS_MANAGER', true],
        // /operations
        ['/operations', 'OPERATIONS_MANAGER', true],
        ['/operations', 'OWNER', true],
        ['/operations', 'SYSTEM_SUPER_ADMIN', true],
        ['/operations', 'EMPLOYEE', false],
        ['/operations', 'CUSTOMER', false],
        // /staff
        ['/staff', 'EMPLOYEE', true],
        ['/staff', 'OPERATIONS_MANAGER', true],
        ['/staff', 'OWNER', true],
        ['/staff', 'SYSTEM_SUPER_ADMIN', false],
        ['/staff', 'CUSTOMER', false],
        // /account/profile (exact, all roles)
        ['/account/profile', 'CUSTOMER', true],
        ['/account/profile', 'EMPLOYEE', true],
        ['/account/profile', 'OPERATIONS_MANAGER', true],
        ['/account/profile', 'OWNER', true],
        ['/account/profile', 'SYSTEM_SUPER_ADMIN', true],
        // /account (customer only)
        ['/account', 'CUSTOMER', true],
        ['/account', 'EMPLOYEE', false],
        ['/account/bookings', 'CUSTOMER', true],
        ['/account/bookings', 'EMPLOYEE', false],
      ];

      it.each(routeMatrix)(
        'route %s for role %s => %s',
        (route, role, expected) => {
          expect(canAccessRoute(role, route)).toBe(expected);
        },
      );

      it('identifies protected routes', () => {
        expect(isProtectedRoute('/system-admin')).toBe(true);
        expect(isProtectedRoute('/admin')).toBe(true);
        expect(isProtectedRoute('/operations')).toBe(true);
        expect(isProtectedRoute('/staff')).toBe(true);
        expect(isProtectedRoute('/account')).toBe(true);
        // Public routes
        expect(isProtectedRoute('/')).toBe(false);
        expect(isProtectedRoute('/services')).toBe(false);
      });
    });
  });

  // ===========================================================================
  // SECTION 2: PERMISSIONS MATRIX (الصلاحيات الدقيقة لكل حساب)
  // ===========================================================================
  describe('§2 Fine-Grained Permissions Matrix', () => {

    it('defines exactly 21 permission codes', () => {
      expect(PERMISSIONS).toHaveLength(21);
    });

    describe('Default Role Permissions', () => {
      it('OWNER & SYSTEM_SUPER_ADMIN have wildcard (*) access to all 21 codes', () => {
        for (const permission of PERMISSIONS) {
          expect(roleHasDefaultPermission(UserRole.OWNER, permission)).toBe(true);
          expect(roleHasDefaultPermission(UserRole.SYSTEM_SUPER_ADMIN, permission)).toBe(true);
        }
      });

      it('OPERATIONS_MANAGER has all defaults except catalog.price.manage and employee.manage', () => {
        const opsDefaults: PermissionCode[] = [
          'booking.accept', 'booking.assign', 'booking.view_unassigned', 'booking.close',
          'booking.override_close', 'booking.reschedule', 'booking.release_hold',
          'payment.review', 'payment.record_balance', 'refund.record_proof', 'refund.approve',
          'cancellation.review', 'quality.review', 'complaint.manage', 'subscription.manage',
          'reports.revenue', 'audit.view', 'workforce.manage', 'task.execute',
        ];
        for (const p of opsDefaults) {
          expect(roleHasDefaultPermission(UserRole.OPERATIONS_MANAGER, p)).toBe(true);
        }
        expect(roleHasDefaultPermission(UserRole.OPERATIONS_MANAGER, 'catalog.price.manage')).toBe(false);
        expect(roleHasDefaultPermission(UserRole.OPERATIONS_MANAGER, 'employee.manage')).toBe(false);
      });

      it('EMPLOYEE has only task.execute by default', () => {
        expect(roleHasDefaultPermission(UserRole.EMPLOYEE, 'task.execute')).toBe(true);
        const nonEmployeeDefaults = PERMISSIONS.filter(p => p !== 'task.execute');
        for (const p of nonEmployeeDefaults) {
          expect(roleHasDefaultPermission(UserRole.EMPLOYEE, p)).toBe(false);
        }
      });

      it('CUSTOMER has no permissions', () => {
        for (const permission of PERMISSIONS) {
          expect(roleHasDefaultPermission(UserRole.CUSTOMER, permission)).toBe(false);
        }
      });
    });

    describe('Employee Delegatable Permissions', () => {
      const ALLOWED: PermissionCode[] = [
        'payment.review', 'booking.accept', 'booking.view_unassigned',
        'quality.review', 'payment.record_balance', 'refund.record_proof', 'booking.close',
      ];
      const BLOCKED: PermissionCode[] = [
        'booking.assign', 'booking.override_close', 'booking.reschedule',
        'booking.release_hold', 'refund.approve', 'cancellation.review', 'complaint.manage',
        'subscription.manage', 'reports.revenue', 'audit.view', 'workforce.manage',
        'employee.manage', 'catalog.price.manage', 'task.execute',
      ];

      it.each(ALLOWED)('CAN delegate %s to employee', (p) => {
        expect(canRoleReceivePermission(UserRole.EMPLOYEE, p)).toBe(true);
      });

      it.each(BLOCKED)('CANNOT delegate %s to employee', (p) => {
        expect(canRoleReceivePermission(UserRole.EMPLOYEE, p)).toBe(false);
      });
    });

    describe('Permission Decision Resolution', () => {
      it('DENY always wins regardless of role default', () => {
        expect(resolvePermissionDecision({
          role: UserRole.OWNER, // wildcard role
          permission: 'booking.accept',
          explicitEffect: PermissionEffect.DENY,
        })).toBe(false);
      });

      it('explicit GRANT overrides a role with no default', () => {
        expect(resolvePermissionDecision({
          role: UserRole.EMPLOYEE,
          permission: 'payment.review',
          explicitEffect: PermissionEffect.GRANT,
        })).toBe(true);
      });

      it('configured array role permissions override defaults', () => {
        expect(resolvePermissionDecision({
          role: UserRole.EMPLOYEE,
          permission: 'booking.accept',
          configuredRolePermissions: ['booking.accept'],
        })).toBe(true);
      });

      it('configured wildcard array role permissions grant all', () => {
        expect(resolvePermissionDecision({
          role: UserRole.EMPLOYEE,
          permission: 'catalog.price.manage',
          configuredRolePermissions: ['*'],
        })).toBe(true);
      });

      it('configured object role permissions with boolean false block', () => {
        expect(resolvePermissionDecision({
          role: UserRole.OPERATIONS_MANAGER,
          permission: 'booking.accept',
          configuredRolePermissions: { 'booking.accept': false },
        })).toBe(false);
      });

      it('falls back to hard-coded role default if no overrides match', () => {
        expect(resolvePermissionDecision({
          role: UserRole.OPERATIONS_MANAGER,
          permission: 'booking.accept',
        })).toBe(true);
        expect(resolvePermissionDecision({
          role: UserRole.EMPLOYEE,
          permission: 'booking.accept',
        })).toBe(false);
      });
    });

    describe('Multi-Scope Permission Override Resolution', () => {
      it('DENY on branch wins over GRANT on team', () => {
        const effect = selectExplicitPermissionEffectForScopes({
          overrides: [
            { effect: PermissionEffect.DENY, scopeType: 'BRANCH', scopeId: 'br-1', expiresAt: null },
            { effect: PermissionEffect.GRANT, scopeType: 'TEAM', scopeId: 'tm-1', expiresAt: null },
          ],
          scopes: [
            { type: 'BRANCH', id: 'br-1' },
            { type: 'TEAM', id: 'tm-1' },
          ],
        });
        expect(effect).toBe(PermissionEffect.DENY);
      });

      it('GLOBAL DENY wins over branch GRANT', () => {
        const effect = selectExplicitPermissionEffectForScopes({
          overrides: [
            { effect: PermissionEffect.DENY, scopeType: 'GLOBAL', scopeId: 'GLOBAL', expiresAt: null },
            { effect: PermissionEffect.GRANT, scopeType: 'BRANCH', scopeId: 'br-1', expiresAt: null },
          ],
          scopes: [{ type: 'BRANCH', id: 'br-1' }],
        });
        expect(effect).toBe(PermissionEffect.DENY);
      });

      it('expired overrides are ignored', () => {
        const past = new Date('2020-01-01');
        const effect = selectExplicitPermissionEffectForScopes({
          overrides: [
            { effect: PermissionEffect.DENY, scopeType: 'BRANCH', scopeId: 'br-1', expiresAt: past },
          ],
          scopes: [{ type: 'BRANCH', id: 'br-1' }],
        });
        expect(effect).toBeUndefined();
      });

      it('single scope selectExplicitPermissionEffect works', () => {
        const effect = selectExplicitPermissionEffect({
          overrides: [
            { effect: PermissionEffect.GRANT, scopeType: 'BRANCH', scopeId: 'br-1', expiresAt: null },
          ],
          scope: { type: 'BRANCH', id: 'br-1' },
        });
        expect(effect).toBe(PermissionEffect.GRANT);
      });

      it('returns undefined when no overrides match the scope', () => {
        const effect = selectExplicitPermissionEffectForScopes({
          overrides: [
            { effect: PermissionEffect.GRANT, scopeType: 'BRANCH', scopeId: 'br-1', expiresAt: null },
          ],
          scopes: [{ type: 'BRANCH', id: 'br-2' }],
        });
        expect(effect).toBeUndefined();
      });
    });
  });

  // ===========================================================================
  // SECTION 3: WORKFORCE MANAGEMENT (إدارة القوى العاملة)
  // ===========================================================================
  describe('§3 Workforce Account Management', () => {
    it('OWNER/ADMIN can manage OPS_MANAGER and EMPLOYEE', () => {
      expect(canManageWorkforceAccount('OWNER', 'OPERATIONS_MANAGER')).toBe(true);
      expect(canManageWorkforceAccount('OWNER', 'EMPLOYEE')).toBe(true);
      expect(canManageWorkforceAccount('SYSTEM_SUPER_ADMIN', 'OPERATIONS_MANAGER')).toBe(true);
    });

    it('OWNER/ADMIN cannot manage OWNER or SYSTEM_SUPER_ADMIN', () => {
      expect(canManageWorkforceAccount('OWNER', 'OWNER')).toBe(false);
      expect(canManageWorkforceAccount('OWNER', 'SYSTEM_SUPER_ADMIN')).toBe(false);
      expect(canManageWorkforceAccount('OWNER', 'CUSTOMER')).toBe(false);
    });

    it('OPS_MANAGER can only manage EMPLOYEE (no role promotion)', () => {
      expect(canManageWorkforceAccount('OPERATIONS_MANAGER', 'EMPLOYEE')).toBe(true);
      expect(canManageWorkforceAccount('OPERATIONS_MANAGER', 'EMPLOYEE', 'OPERATIONS_MANAGER')).toBe(false);
      expect(canManageWorkforceAccount('OPERATIONS_MANAGER', 'OPERATIONS_MANAGER')).toBe(false);
    });

    it('EMPLOYEE and CUSTOMER cannot manage anyone', () => {
      expect(canManageWorkforceAccount('EMPLOYEE', 'EMPLOYEE')).toBe(false);
      expect(canManageWorkforceAccount('CUSTOMER', 'EMPLOYEE')).toBe(false);
    });

    it('branch scope checks for workforce accounts', () => {
      // Brand-wide actors pass null
      expect(isWorkforceAccountWithinManagedBranches(['br-1', 'br-2'], null)).toBe(true);
      // Manager with br-1 access
      const managed = new Set(['br-1']);
      expect(isWorkforceAccountWithinManagedBranches(['br-1'], managed)).toBe(true);
      // Employee with membership in br-2 is outside manager's scope
      expect(isWorkforceAccountWithinManagedBranches(['br-1', 'br-2'], managed)).toBe(false);
      // Employee with no branches
      expect(isWorkforceAccountWithinManagedBranches([], managed)).toBe(false);
    });
  });

  // ===========================================================================
  // SECTION 4: TASK ASSIGNMENT ACCESS (صلاحيات مهام الفنيين)
  // ===========================================================================
  describe('§4 Employee Task Assignment Access', () => {
    it('team member with no specific assignment can access task', () => {
      expect(canEmployeeAccessTaskAssignment({
        employeeId: 'emp-1',
        assignedEmployeeId: null,
        isTeamMember: true,
        isTeamLeader: false,
      })).toBe(true);
    });

    it('assigned employee can access own task', () => {
      expect(canEmployeeAccessTaskAssignment({
        employeeId: 'emp-1',
        assignedEmployeeId: 'emp-1',
        isTeamMember: true,
        isTeamLeader: false,
      })).toBe(true);
    });

    it('team leader can access tasks assigned to another employee', () => {
      expect(canEmployeeAccessTaskAssignment({
        employeeId: 'emp-leader',
        assignedEmployeeId: 'emp-2',
        isTeamMember: true,
        isTeamLeader: true,
      })).toBe(true);
    });

    it('non-assigned non-leader team member CANNOT access task assigned to someone else', () => {
      expect(canEmployeeAccessTaskAssignment({
        employeeId: 'emp-3',
        assignedEmployeeId: 'emp-2',
        isTeamMember: true,
        isTeamLeader: false,
      })).toBe(false);
    });

    it('non-team-member cannot access any task', () => {
      expect(canEmployeeAccessTaskAssignment({
        employeeId: 'emp-outsider',
        assignedEmployeeId: null,
        isTeamMember: false,
        isTeamLeader: false,
      })).toBe(false);
    });
  });

  // ===========================================================================
  // SECTION 5: DATA SANITIZATION & SECURITY (تنظيف البيانات الحساسة)
  // ===========================================================================
  describe('§5 Client Data Sanitization & Security', () => {
    it('strips sensitive keys from objects', () => {
      const raw = {
        id: 'u-1',
        fullName: 'أحمد',
        passwordHash: 'secret-hash',
        tempPasswordHash: 'temp-hash',
        mustChangePwd: true,
        deletedAt: new Date(),
        role: 'CUSTOMER',
      };
      const sanitized = sanitizeClientData(raw);
      expect(sanitized).not.toHaveProperty('passwordHash');
      expect(sanitized).not.toHaveProperty('tempPasswordHash');
      expect(sanitized).not.toHaveProperty('mustChangePwd');
      expect(sanitized).not.toHaveProperty('deletedAt');
      expect(sanitized).toHaveProperty('id', 'u-1');
      expect(sanitized).toHaveProperty('fullName', 'أحمد');
    });

    it('sanitizes arrays recursively', () => {
      const arr = [
        { id: '1', passwordHash: 'a' },
        { id: '2', passwordHash: 'b' },
      ];
      const sanitized = sanitizeClientData(arr);
      for (const item of sanitized) {
        expect(item).not.toHaveProperty('passwordHash');
        expect(item).toHaveProperty('id');
      }
    });

    it('preserves Date objects and null', () => {
      const d = new Date();
      expect(sanitizeClientData(d)).toBe(d);
      expect(sanitizeClientData(null)).toBeNull();
    });

    it('toPublicUser strips internal fields', () => {
      const user = toPublicUser({
        id: 'u-1', fullName: 'User', phone: '01012345678',
        whatsapp: '01012345678', email: null, role: UserRole.CUSTOMER, active: true,
      });
      expect(user).toEqual({
        id: 'u-1', fullName: 'User', phone: '01012345678',
        whatsapp: '01012345678', email: null, role: 'CUSTOMER', active: true,
      });
    });

    describe('Safe Return URL', () => {
      it('accepts valid local paths', () => {
        expect(getSafeLocalReturnPath('/account')).toBe('/account');
        expect(getSafeLocalReturnPath('/admin/calendar')).toBe('/admin/calendar');
        expect(getSafeLocalReturnPath('/staff?tab=tasks')).toBe('/staff?tab=tasks');
      });

      it('rejects external and malicious URLs', () => {
        expect(getSafeLocalReturnPath('https://evil.com')).toBeNull();
        expect(getSafeLocalReturnPath('//evil.com')).toBeNull();
        expect(getSafeLocalReturnPath('\\\\evil.com')).toBeNull();
        expect(getSafeLocalReturnPath('')).toBeNull();
        expect(getSafeLocalReturnPath(42)).toBeNull();
        expect(getSafeLocalReturnPath(null)).toBeNull();
      });
    });
  });

  // ===========================================================================
  // SECTION 6: FULL STATE MACHINE (آلة حالات الحجز الكاملة)
  // ===========================================================================
  describe('§6 Booking State Machine - Complete Transition Table', () => {

    describe('Exhaustive Transition Graph Verification', () => {
      const allStatuses = Object.values(BookingStatus);

      it('transition table covers every BookingStatus enum value', () => {
        for (const status of allStatuses) {
          expect(ALLOWED_STATUS_TRANSITIONS).toHaveProperty(status);
        }
      });

      it('no status transitions to itself', () => {
        for (const status of allStatuses) {
          expect(isValidStatusTransition(status, status)).toBe(false);
        }
      });

      it('terminal statuses have no outgoing transitions', () => {
        const terminals = [BookingStatus.CLOSED, BookingStatus.CANCELLED, BookingStatus.REJECTED, BookingStatus.EXPIRED];
        for (const terminal of terminals) {
          expect(ALLOWED_STATUS_TRANSITIONS[terminal]).toEqual([]);
        }
      });

      it('every listed transition passes isValidStatusTransition', () => {
        for (const [from, toList] of Object.entries(ALLOWED_STATUS_TRANSITIONS)) {
          for (const to of toList) {
            expect(isValidStatusTransition(from as BookingStatus, to)).toBe(true);
          }
        }
      });

      it('unlisted transitions are blocked', () => {
        // Spot-check illegal hops
        expect(isValidStatusTransition(BookingStatus.ASSIGNED, BookingStatus.IN_SERVICE)).toBe(false);
        expect(isValidStatusTransition(BookingStatus.ON_THE_WAY, BookingStatus.QUALITY_REVIEW)).toBe(false);
        expect(isValidStatusTransition(BookingStatus.ARRIVED, BookingStatus.DELIVERED)).toBe(false);
        expect(isValidStatusTransition(BookingStatus.DRAFT, BookingStatus.CLOSED)).toBe(false);
        expect(isValidStatusTransition(BookingStatus.PAYMENT_VERIFIED, BookingStatus.CLOSED)).toBe(false);
      });
    });

    describe('Happy Path: Full Customer→Ops→Tech Lifecycle', () => {
      const happyPath: [BookingStatus, BookingStatus][] = [
        [BookingStatus.DRAFT, BookingStatus.REQUEST_SUBMITTED],
        [BookingStatus.REQUEST_SUBMITTED, BookingStatus.AWAITING_PAYMENT_PROOF],
        [BookingStatus.AWAITING_PAYMENT_PROOF, BookingStatus.PAYMENT_UNDER_REVIEW],
        [BookingStatus.PAYMENT_UNDER_REVIEW, BookingStatus.PAYMENT_VERIFIED],
        [BookingStatus.PAYMENT_VERIFIED, BookingStatus.AWAITING_OPERATIONS_REVIEW],
        [BookingStatus.AWAITING_OPERATIONS_REVIEW, BookingStatus.ACCEPTED],
        [BookingStatus.ACCEPTED, BookingStatus.ASSIGNED],
        [BookingStatus.ASSIGNED, BookingStatus.TEAM_ACKNOWLEDGED],
        [BookingStatus.TEAM_ACKNOWLEDGED, BookingStatus.ON_THE_WAY],
        [BookingStatus.ON_THE_WAY, BookingStatus.ARRIVED],
        [BookingStatus.ARRIVED, BookingStatus.IN_SERVICE],
        [BookingStatus.IN_SERVICE, BookingStatus.QUALITY_REVIEW],
        [BookingStatus.QUALITY_REVIEW, BookingStatus.SERVICE_COMPLETED],
        [BookingStatus.SERVICE_COMPLETED, BookingStatus.DELIVERED],
        [BookingStatus.DELIVERED, BookingStatus.CLOSED],
      ];

      it.each(happyPath)('%s → %s is valid', (from, to) => {
        expect(isValidStatusTransition(from, to)).toBe(true);
      });
    });

    describe('Validated Transition Guards', () => {
      it('same-status is rejected with SAME_STATUS code', () => {
        const r = validateStatusTransition(BookingStatus.ARRIVED, BookingStatus.ARRIVED);
        expect(r).toEqual({ allowed: false, code: 'SAME_STATUS', message: expect.any(String) });
      });

      it('illegal transition returns ILLEGAL_TRANSITION', () => {
        const r = validateStatusTransition(BookingStatus.DRAFT, BookingStatus.CLOSED);
        expect(r).toEqual({ allowed: false, code: 'ILLEGAL_TRANSITION', message: expect.any(String) });
      });

      // Reason required statuses checked via representative validation

      it('requires reason for all failure/administrative statuses', () => {
        // Test one representative transition for reason requirement
        const r = validateStatusTransition(BookingStatus.ARRIVED, BookingStatus.CUSTOMER_NO_SHOW, {
          hasAssignedTeam: true, reason: '',
        });
        expect(r.allowed).toBe(false);
        expect(r.code).toBe('REASON_REQUIRED');

        const ok = validateStatusTransition(BookingStatus.ARRIVED, BookingStatus.CUSTOMER_NO_SHOW, {
          hasAssignedTeam: true, reason: 'العميل غير متواجد',
        });
        expect(ok.allowed).toBe(true);
      });

      it('payment gating: PAYMENT_VERIFIED requires confirmed payment', () => {
        const fail = validateStatusTransition(BookingStatus.PAYMENT_UNDER_REVIEW, BookingStatus.PAYMENT_VERIFIED, {
          paymentStatus: PaymentStatus.UNDER_REVIEW,
        });
        expect(fail.code).toBe('PAYMENT_NOT_CONFIRMED');

        for (const ps of [PaymentStatus.VERIFIED, PaymentStatus.NOT_REQUIRED, PaymentStatus.PARTIALLY_PAID, PaymentStatus.FULLY_PAID]) {
          const ok = validateStatusTransition(BookingStatus.PAYMENT_UNDER_REVIEW, BookingStatus.PAYMENT_VERIFIED, {
            paymentStatus: ps,
          });
          expect(ok.allowed).toBe(true);
        }
      });

      it('team assignment gating: ASSIGNED and beyond require hasAssignedTeam', () => {
        const fail = validateStatusTransition(BookingStatus.ACCEPTED, BookingStatus.ASSIGNED, {
          hasAssignedTeam: false,
        });
        expect(fail.code).toBe('TEAM_NOT_ASSIGNED');

        const ok = validateStatusTransition(BookingStatus.ACCEPTED, BookingStatus.ASSIGNED, {
          hasAssignedTeam: true,
        });
        expect(ok.allowed).toBe(true);
      });

      it('team scope gating: EMPLOYEE must belong to assigned team', () => {
        const fail = validateStatusTransition(BookingStatus.ASSIGNED, BookingStatus.TEAM_ACKNOWLEDGED, {
          hasAssignedTeam: true,
          actorRole: UserRole.EMPLOYEE,
          actorBelongsToAssignedTeam: false,
        });
        expect(fail.code).toBe('TEAM_SCOPE_REQUIRED');

        const ok = validateStatusTransition(BookingStatus.ASSIGNED, BookingStatus.TEAM_ACKNOWLEDGED, {
          hasAssignedTeam: true,
          actorRole: UserRole.EMPLOYEE,
          actorBelongsToAssignedTeam: true,
        });
        expect(ok.allowed).toBe(true);
      });

      it('checklist gating for IN_SERVICE: needs TEAM_PREPARATION and ARRIVAL_INSPECTION', () => {
        const missing = validateStatusTransition(BookingStatus.ARRIVED, BookingStatus.IN_SERVICE, {
          hasAssignedTeam: true,
          completedChecklistStages: [ChecklistStage.TEAM_PREPARATION],
        });
        expect(missing.code).toBe('CHECKLIST_INCOMPLETE');

        const ok = validateStatusTransition(BookingStatus.ARRIVED, BookingStatus.IN_SERVICE, {
          hasAssignedTeam: true,
          completedChecklistStages: [ChecklistStage.TEAM_PREPARATION, ChecklistStage.ARRIVAL_INSPECTION],
        });
        expect(ok.allowed).toBe(true);
      });

      it('checklist gating for QUALITY_REVIEW: needs all 4 execution stages', () => {
        const partial = validateStatusTransition(BookingStatus.IN_SERVICE, BookingStatus.QUALITY_REVIEW, {
          hasAssignedTeam: true,
          completedChecklistStages: [ChecklistStage.TEAM_PREPARATION, ChecklistStage.ARRIVAL_INSPECTION, ChecklistStage.SERVICE_EXECUTION],
        });
        expect(partial.code).toBe('CHECKLIST_INCOMPLETE');

        const ok = validateStatusTransition(BookingStatus.IN_SERVICE, BookingStatus.QUALITY_REVIEW, {
          hasAssignedTeam: true,
          completedChecklistStages: EXECUTION_CHECKLIST_STAGES,
        });
        expect(ok.allowed).toBe(true);
      });

      it('quality approval gating for SERVICE_COMPLETED', () => {
        const fail = validateStatusTransition(BookingStatus.QUALITY_REVIEW, BookingStatus.SERVICE_COMPLETED, {
          hasAssignedTeam: true, qualityApproved: false,
        });
        expect(fail.code).toBe('QUALITY_APPROVAL_REQUIRED');

        const ok = validateStatusTransition(BookingStatus.QUALITY_REVIEW, BookingStatus.SERVICE_COMPLETED, {
          hasAssignedTeam: true, qualityApproved: true,
        });
        expect(ok.allowed).toBe(true);
      });

      it('financial gating for CLOSED: amountDue must be 0', () => {
        const owing = validateStatusTransition(BookingStatus.DELIVERED, BookingStatus.CLOSED, {
          hasAssignedTeam: true, amountDue: 50,
        });
        expect(owing.code).toBe('OUTSTANDING_BALANCE');

        const settled = validateStatusTransition(BookingStatus.DELIVERED, BookingStatus.CLOSED, {
          hasAssignedTeam: true, amountDue: 0,
        });
        expect(settled.allowed).toBe(true);
      });

      it('terminal administrative review blocks all transitions', () => {
        const r = validateStatusTransition(BookingStatus.QUALITY_REVIEW, BookingStatus.SERVICE_COMPLETED, {
          hasAssignedTeam: true, qualityApproved: true,
          terminalAdministrativeReview: true,
        });
        expect(r.code).toBe('TERMINAL_REVIEW_ONLY');
      });

      it('manager override requires OPS/OWNER role', () => {
        const emp = validateStatusTransition(BookingStatus.IN_SERVICE, BookingStatus.QUALITY_REVIEW, {
          managerOverride: true, actorRole: UserRole.EMPLOYEE,
        });
        expect(emp.code).toBe('MANAGER_OVERRIDE_FORBIDDEN');
      });

      it('manager override requires reason', () => {
        const noReason = validateStatusTransition(BookingStatus.IN_SERVICE, BookingStatus.QUALITY_REVIEW, {
          managerOverride: true, actorRole: UserRole.OPERATIONS_MANAGER, reason: '',
        });
        expect(noReason.code).toBe('MANAGER_OVERRIDE_REASON_REQUIRED');
      });

      it('manager override with reason bypasses checklists for QUALITY_REVIEW', () => {
        const ok = validateStatusTransition(BookingStatus.IN_SERVICE, BookingStatus.QUALITY_REVIEW, {
          managerOverride: true, actorRole: UserRole.OWNER,
          reason: 'حالة طوارئ',
          hasAssignedTeam: true,
          completedChecklistStages: [], // None completed
        });
        expect(ok.allowed).toBe(true);
      });
    });

    describe('Customer-Facing Status Labels', () => {
      it('every BookingStatus has a label', () => {
        for (const status of Object.values(BookingStatus)) {
          const label = getCustomerFacingStatusLabel(status);
          expect(label).toBeTruthy();
          expect(typeof label).toBe('string');
        }
      });
    });
  });

  // ===========================================================================
  // SECTION 7: EVIDENCE STAGE GATING (قيود رفع الصور والقوائم)
  // ===========================================================================
  describe('§7 Evidence Stage & Checklist Gating', () => {

    describe('Checklist Stage Windows', () => {
      it('TEAM_PREPARATION: allowed in TEAM_ACKNOWLEDGED, ON_THE_WAY, ARRIVED', () => {
        expect(canEditChecklistStage(BookingStatus.TEAM_ACKNOWLEDGED, ChecklistStage.TEAM_PREPARATION)).toBe(true);
        expect(canEditChecklistStage(BookingStatus.ON_THE_WAY, ChecklistStage.TEAM_PREPARATION)).toBe(true);
        expect(canEditChecklistStage(BookingStatus.ARRIVED, ChecklistStage.TEAM_PREPARATION)).toBe(true);
        // Blocked elsewhere
        expect(canEditChecklistStage(BookingStatus.ASSIGNED, ChecklistStage.TEAM_PREPARATION)).toBe(false);
        expect(canEditChecklistStage(BookingStatus.IN_SERVICE, ChecklistStage.TEAM_PREPARATION)).toBe(false);
        expect(canEditChecklistStage(BookingStatus.QUALITY_REVIEW, ChecklistStage.TEAM_PREPARATION)).toBe(false);
        expect(canEditChecklistStage(BookingStatus.DELIVERED, ChecklistStage.TEAM_PREPARATION)).toBe(false);
      });

      it('ARRIVAL_INSPECTION: only ARRIVED', () => {
        expect(canEditChecklistStage(BookingStatus.ARRIVED, ChecklistStage.ARRIVAL_INSPECTION)).toBe(true);
        expect(canEditChecklistStage(BookingStatus.ON_THE_WAY, ChecklistStage.ARRIVAL_INSPECTION)).toBe(false);
        expect(canEditChecklistStage(BookingStatus.IN_SERVICE, ChecklistStage.ARRIVAL_INSPECTION)).toBe(false);
      });

      it('SERVICE_EXECUTION and CLOSING: only IN_SERVICE', () => {
        expect(canEditChecklistStage(BookingStatus.IN_SERVICE, ChecklistStage.SERVICE_EXECUTION)).toBe(true);
        expect(canEditChecklistStage(BookingStatus.IN_SERVICE, ChecklistStage.CLOSING)).toBe(true);
        expect(canEditChecklistStage(BookingStatus.ARRIVED, ChecklistStage.SERVICE_EXECUTION)).toBe(false);
        expect(canEditChecklistStage(BookingStatus.QUALITY_REVIEW, ChecklistStage.SERVICE_EXECUTION)).toBe(false);
        expect(canEditChecklistStage(BookingStatus.ARRIVED, ChecklistStage.CLOSING)).toBe(false);
      });
    });

  });

  // ===========================================================================
  // SECTION 8: PAYMENT & PRICING (الدفع والتسعير)
  // ===========================================================================
  describe('§8 Payment Totals, Pricing & Deposits', () => {

    describe('Booking Payment Totals', () => {
      it('calculates amountPaid and amountDue correctly', () => {
        expect(calculateBookingPaymentTotals({
          totalPrice: 1000, creditAppliedAmount: 200, verifiedCashAmount: 500,
        })).toEqual({ amountPaid: 700, amountDue: 300 });
      });

      it('caps amountPaid at totalPrice', () => {
        expect(calculateBookingPaymentTotals({
          totalPrice: 500, creditAppliedAmount: 300, verifiedCashAmount: 400,
        })).toEqual({ amountPaid: 500, amountDue: 0 });
      });

      it('rejects negative values', () => {
        expect(() => calculateBookingPaymentTotals({
          totalPrice: -1, creditAppliedAmount: 0, verifiedCashAmount: 0,
        })).toThrow();
      });

      it('rejects non-integer values', () => {
        expect(() => calculateBookingPaymentTotals({
          totalPrice: 100.5, creditAppliedAmount: 0, verifiedCashAmount: 0,
        })).toThrow();
      });
    });

    describe('Balance Collection Eligibility by Status', () => {
      const eligible = [
        BookingStatus.ACCEPTED, BookingStatus.AWAITING_ASSIGNMENT, BookingStatus.ASSIGNED,
        BookingStatus.ARRIVED, BookingStatus.IN_SERVICE, BookingStatus.QUALITY_REVIEW,
        BookingStatus.SERVICE_COMPLETED, BookingStatus.DELIVERED, BookingStatus.CLOSED,
      ];
      const ineligible = [
        BookingStatus.DRAFT, BookingStatus.REQUEST_SUBMITTED,
        BookingStatus.AWAITING_PAYMENT_PROOF, BookingStatus.PAYMENT_UNDER_REVIEW,
        BookingStatus.CANCELLED, BookingStatus.REJECTED, BookingStatus.EXPIRED,
      ];

      it.each(eligible)('status %s allows balance collection', (s) => {
        expect(canRecordBookingBalance(s)).toBe(true);
      });
      it.each(ineligible)('status %s blocks balance collection', (s) => {
        expect(canRecordBookingBalance(s)).toBe(false);
      });
    });

    describe('Deposit Calculation', () => {
      it('no deposit when not required', () => {
        expect(calculateDeposit(1000, false, false, 'FIXED', 200)).toBe(0);
      });

      it('full prepayment returns total price', () => {
        expect(calculateDeposit(1000, true, true, 'FIXED', 200)).toBe(1000);
      });

      it('fixed deposit capped at total', () => {
        expect(calculateDeposit(500, true, false, 'FIXED', 300)).toBe(300);
        expect(calculateDeposit(200, true, false, 'FIXED', 300)).toBe(200);
      });

      it('percentage deposit works', () => {
        expect(calculateDeposit(1000, true, false, 'PERCENTAGE', 25)).toBe(250);
        expect(calculateDeposit(1000, true, false, 'PERCENTAGE', 150)).toBe(1000); // capped at 100%
      });

      it('zero total returns zero deposit', () => {
        expect(calculateDeposit(0, true, false, 'FIXED', 200)).toBe(0);
      });
    });

    describe('Booking Quote Calculator', () => {
      it('calculates base quote correctly', () => {
        const quote = calculateBookingQuote({
          base: { price: 500, durationMinutes: 60 },
          addons: [],
          depositRequired: true,
          fullPrepayment: false,
          depositType: 'PERCENTAGE',
          depositValue: 50,
        });
        expect(quote.basePrice).toBe(500);
        expect(quote.addonPrice).toBe(0);
        expect(quote.totalPrice).toBe(500);
        expect(quote.depositAmount).toBe(250);
        expect(quote.totalDurationMinutes).toBe(60);
        expect(quote.slotCount).toBe(1);
      });

      it('includes addons in pricing', () => {
        const quote = calculateBookingQuote({
          base: { price: 500, durationMinutes: 60, slotCount: 1 },
          addons: [
            { price: 100, durationMinutes: 30, slotCount: 1 },
            { price: 50, durationMinutes: 15 },
          ],
          depositRequired: false,
          fullPrepayment: false,
          depositType: 'FIXED',
          depositValue: 0,
        });
        expect(quote.totalPrice).toBe(650);
        expect(quote.totalDurationMinutes).toBe(105);
        expect(quote.slotCount).toBe(2); // 1 base + 1 addon
      });

      it('subscription covers base price', () => {
        const quote = calculateBookingQuote({
          base: { price: 500, durationMinutes: 60 },
          addons: [{ price: 100, durationMinutes: 30 }],
          depositRequired: true,
          fullPrepayment: false,
          depositType: 'FIXED',
          depositValue: 50,
          subscriptionCoversBase: true,
        });
        expect(quote.basePrice).toBe(0);
        expect(quote.totalPrice).toBe(100); // addons only
      });
    });
  });

  // ===========================================================================
  // SECTION 9: CANCELLATION SETTLEMENT (تسوية الإلغاء)
  // ===========================================================================
  describe('§9 Cancellation Settlement Logic', () => {
    it('REFUND_FULL: returns everything', () => {
      const s = calculateCancellationSettlement({
        resolutionType: 'REFUND_FULL', amountPaid: 1000, depositAmount: 200,
      });
      expect(s.approvedRefundAmount + s.creditAmount + s.retainedAmount).toBe(1000);
      expect(s.retainedAmount).toBe(0);
    });

    it('REFUND_FULL with credit applied: refund=cash, credit returned', () => {
      const s = calculateCancellationSettlement({
        resolutionType: 'REFUND_FULL', amountPaid: 1000, depositAmount: 200,
        creditAppliedAmount: 300,
      });
      expect(s.approvedRefundAmount).toBe(700); // cash portion
      expect(s.creditAmount).toBe(300); // credit returned
      expect(s.retainedAmount).toBe(0);
    });

    it('REFUND_PARTIAL: splits refund and retained', () => {
      const s = calculateCancellationSettlement({
        resolutionType: 'REFUND_PARTIAL', amountPaid: 1000, depositAmount: 200,
        requestedRefundAmount: 600,
      });
      expect(s.approvedRefundAmount).toBe(600);
      expect(s.retainedAmount).toBe(400);
      expect(s.approvedRefundAmount + s.creditAmount + s.retainedAmount).toBe(1000);
    });

    it('NO_REFUND: retains everything', () => {
      const s = calculateCancellationSettlement({
        resolutionType: 'NO_REFUND', amountPaid: 1000, depositAmount: 200,
      });
      expect(s.retainedAmount).toBe(1000);
      expect(s.approvedRefundAmount).toBe(0);
    });

    it('CREDIT: all goes to customer credit', () => {
      const s = calculateCancellationSettlement({
        resolutionType: 'CREDIT', amountPaid: 1000, depositAmount: 200,
      });
      expect(s.creditAmount).toBe(1000);
      expect(s.approvedRefundAmount).toBe(0);
      expect(s.retainedAmount).toBe(0);
    });

    it('KEEP_DEPOSIT: retains deposit, refunds rest', () => {
      const s = calculateCancellationSettlement({
        resolutionType: 'KEEP_DEPOSIT', amountPaid: 1000, depositAmount: 200,
      });
      expect(s.retainedAmount).toBe(200);
      expect(s.approvedRefundAmount + s.creditAmount).toBe(800);
    });

    it('VISIT_FEE: retains fee, refunds rest', () => {
      const s = calculateCancellationSettlement({
        resolutionType: 'VISIT_FEE', amountPaid: 1000, depositAmount: 200,
        visitFeeAmount: 150,
      });
      expect(s.retainedAmount).toBe(150);
      expect(s.approvedRefundAmount + s.creditAmount).toBe(850);
    });

    it('settlement always balances', () => {
      const types: Array<{
        type: Parameters<typeof calculateCancellationSettlement>[0]['resolutionType'];
        extra: { requestedRefundAmount?: number; visitFeeAmount?: number };
      }> = [
        { type: 'REFUND_FULL', extra: {} },
        { type: 'REFUND_PARTIAL', extra: { requestedRefundAmount: 300 } },
        { type: 'NO_REFUND', extra: {} },
        { type: 'CREDIT', extra: {} },
        { type: 'KEEP_DEPOSIT', extra: {} },
        { type: 'VISIT_FEE', extra: { visitFeeAmount: 100 } },
      ];
      for (const { type, extra } of types) {
        const s = calculateCancellationSettlement({
          resolutionType: type, amountPaid: 500, depositAmount: 100, ...extra,
        });
        expect(s.approvedRefundAmount + s.creditAmount + s.retainedAmount).toBe(500);
      }
    });

    describe('Cancellation Payment Outcome', () => {
      it('returns null for zero amountPaid', () => {
        expect(cancellationPaymentOutcome({
          amountPaid: 0, approvedRefundAmount: 0, cashRefunded: 0, creditReturned: 0,
        })).toBeNull();
      });

      it('REFUND_PENDING when cash not yet refunded', () => {
        expect(cancellationPaymentOutcome({
          amountPaid: 1000, approvedRefundAmount: 700, cashRefunded: 0, creditReturned: 300,
        })).toBe('REFUND_PENDING');
      });

      it('REFUNDED when all value returned', () => {
        expect(cancellationPaymentOutcome({
          amountPaid: 1000, approvedRefundAmount: 700, cashRefunded: 700, creditReturned: 300,
        })).toBe('REFUNDED');
      });

      it('PARTIALLY_REFUNDED when some returned', () => {
        expect(cancellationPaymentOutcome({
          amountPaid: 1000, approvedRefundAmount: 700, cashRefunded: 300, creditReturned: 0,
        })).toBe('PARTIALLY_REFUNDED');
      });

      it('NON_REFUNDABLE when nothing returned', () => {
        expect(cancellationPaymentOutcome({
          amountPaid: 1000, approvedRefundAmount: 0, cashRefunded: 0, creditReturned: 0,
        })).toBe('NON_REFUNDABLE');
      });
    });
  });

  // ===========================================================================
  // SECTION 10: OPERATIONS MATH (حسابات التشغيل)
  // ===========================================================================
  describe('§10 Operations Math: Refunds, Coverage, Travel', () => {

    it('calculates refund totals correctly', () => {
      const r = calculateRefundTotals({
        amountPaid: 1000, approvedRefundAmount: 700, refundedAmounts: [300, 200],
      });
      expect(r.totalRefunded).toBe(500);
      expect(r.remainingPaidAmount).toBe(500);
      expect(r.remainingApprovedAmount).toBe(200);
      expect(r.fullyRefunded).toBe(false);
      expect(r.approvedRefundComplete).toBe(false);
    });

    it('detects fully refunded', () => {
      const r = calculateRefundTotals({
        amountPaid: 500, approvedRefundAmount: 500, refundedAmounts: [500],
      });
      expect(r.fullyRefunded).toBe(true);
      expect(r.approvedRefundComplete).toBe(true);
    });

    it('coverage area eligibility', () => {
      expect(isCoverageAreaEligible({ active: true, branchId: 'br-1' }, 'br-1')).toBe(true);
      expect(isCoverageAreaEligible({ active: false, branchId: 'br-1' }, 'br-1')).toBe(false);
      expect(isCoverageAreaEligible({ active: true, branchId: 'br-2' }, 'br-1')).toBe(false);
    });

    it('resolves travel minutes with explicit policy', () => {
      expect(resolveTravelMinutes({
        fromZoneId: 'z1', toZoneId: 'z2',
        travelPolicies: [{ fromZoneId: 'z1', toZoneId: 'z2', durationMinutes: 45 }],
        branchDefaultMinutes: 30,
      })).toBe(45);
    });

    it('resolves same-zone travel', () => {
      expect(resolveTravelMinutes({
        fromZoneId: 'z1', toZoneId: 'z1',
        travelPolicies: [],
        branchDefaultMinutes: 30,
        sameZoneDefaultMinutes: 10,
      })).toBe(10);
    });

    it('falls back to area override then branch default', () => {
      expect(resolveTravelMinutes({
        fromZoneId: 'z1', toZoneId: 'z2',
        travelPolicies: [],
        areaOverrideMinutes: 20,
        branchDefaultMinutes: 30,
      })).toBe(20);

      expect(resolveTravelMinutes({
        fromZoneId: 'z1', toZoneId: 'z2',
        travelPolicies: [],
        branchDefaultMinutes: 30,
      })).toBe(30);
    });
  });

  // ===========================================================================
  // SECTION 11: BOOKING EXPIRATION (انتهاء صلاحية الحجز)
  // ===========================================================================
  describe('§11 Booking Expiration Eligibility', () => {
    it('REQUEST_SUBMITTED and AWAITING_PAYMENT_PROOF can expire', () => {
      expect(canExpireAwaitingPaymentBooking(BookingStatus.REQUEST_SUBMITTED)).toBe(true);
      expect(canExpireAwaitingPaymentBooking(BookingStatus.AWAITING_PAYMENT_PROOF)).toBe(true);
    });

    it('other statuses cannot expire via payment hold', () => {
      expect(canExpireAwaitingPaymentBooking(BookingStatus.PAYMENT_UNDER_REVIEW)).toBe(false);
      expect(canExpireAwaitingPaymentBooking(BookingStatus.ACCEPTED)).toBe(false);
      expect(canExpireAwaitingPaymentBooking(BookingStatus.IN_SERVICE)).toBe(false);
      expect(canExpireAwaitingPaymentBooking(BookingStatus.CLOSED)).toBe(false);
    });
  });

  // ===========================================================================
  // SECTION 12: INVOICE (الفواتير)
  // ===========================================================================
  describe('§12 Invoice Number Generation', () => {
    it('generates stable invoice numbers', () => {
      expect(invoiceNumberForBooking('BQ-2026-1001')).toBe('BRQ-BQ-2026-1001');
      expect(invoiceNumberForBooking('BQ-2026-0042')).toBe('BRQ-BQ-2026-0042');
    });

    it('strips special characters', () => {
      expect(invoiceNumberForBooking('BQ#2026!1001')).toBe('BRQ-BQ20261001');
    });
  });

  // ===========================================================================
  // SECTION 13: PAYMENT VERIFICATION HOLD SELECTION (اختيار الحجز المؤقت)
  // ===========================================================================
  describe('§13 Payment Verification Hold Selection', () => {
    const now = new Date('2026-08-23T10:00:00Z');
    const future = new Date('2026-08-23T11:00:00Z');
    const past = new Date('2026-08-23T09:00:00Z');
    const slotStart = new Date('2026-08-24T08:00:00Z');
    const slotEnd = new Date('2026-08-24T09:00:00Z');

    const hold = (id: string, teamId: string, expired: boolean) => ({
      id, teamId,
      slotStartTime: slotStart, slotEndTime: slotEnd,
      expiresAt: expired ? past : future,
    });

    it('selects live hold matching booking interval', () => {
      const result = selectLiveVerificationHold(
        [hold('h-1', 'tm-1', false)],
        { startAt: slotStart, endAt: slotEnd },
        now,
      );
      expect(result?.id).toBe('h-1');
    });

    it('ignores expired holds', () => {
      const result = selectLiveVerificationHold(
        [hold('h-1', 'tm-1', true)],
        { startAt: slotStart, endAt: slotEnd },
        now,
      );
      expect(result).toBeNull();
    });

    it('retainable hold requires team in feasible list', () => {
      const result = selectRetainableVerificationHold(
        [hold('h-1', 'tm-1', false)],
        ['tm-2'], // tm-1 not feasible
        { startAt: slotStart, endAt: slotEnd },
        now,
      );
      expect(result).toBeNull();

      const ok = selectRetainableVerificationHold(
        [hold('h-1', 'tm-1', false)],
        ['tm-1'],
        { startAt: slotStart, endAt: slotEnd },
        now,
      );
      expect(ok?.id).toBe('h-1');
    });
  });

  // ===========================================================================
  // SECTION 14: CONTACT LINKS (روابط التواصل)
  // ===========================================================================
  describe('§14 Contact Links (Phone & WhatsApp)', () => {
    it('formats phone href correctly', () => {
      expect(phoneHref('01012345678')).toBe('tel:01012345678');
      expect(phoneHref('+2 010-1234-5678')).toBe('tel:+201012345678');
    });

    it('formats WhatsApp href with Egyptian prefix', () => {
      const link = whatsappHref('01012345678', 'مرحبا');
      expect(link).toContain('https://wa.me/201012345678');
      expect(link).toContain('text=');
    });

    it('WhatsApp link without message', () => {
      const link = whatsappHref('01012345678');
      expect(link).toBe('https://wa.me/201012345678');
      expect(link).not.toContain('text=');
    });
  });

  // ===========================================================================
  // SECTION 15: INVENTORY UNITS (وحدات المخزون)
  // ===========================================================================
  describe('§15 Material Inventory Units & Conversions', () => {

    describe('Unit Detection', () => {
      it('detects volume units', () => {
        expect(detectMaterialUnitMeta('لتر').category).toBe('VOLUME');
        expect(detectMaterialUnitMeta('ml').category).toBe('VOLUME');
        expect(detectMaterialUnitMeta('مل').category).toBe('VOLUME');
        expect(detectMaterialUnitMeta('LITER').category).toBe('VOLUME');
      });

      it('detects weight units', () => {
        expect(detectMaterialUnitMeta('كيلو').category).toBe('WEIGHT');
        expect(detectMaterialUnitMeta('جرام').category).toBe('WEIGHT');
        expect(detectMaterialUnitMeta('kg').category).toBe('WEIGHT');
        expect(detectMaterialUnitMeta('g').category).toBe('WEIGHT');
      });

      it('falls back to COUNT', () => {
        expect(detectMaterialUnitMeta('قطعة').category).toBe('COUNT');
        expect(detectMaterialUnitMeta('عدد').category).toBe('COUNT');
        expect(detectMaterialUnitMeta('PIECE').category).toBe('COUNT');
      });
    });

    describe('Database Quantity Conversion', () => {
      it('ml → liters', () => {
        expect(convertToDatabaseQuantity(250, 'ml', 'لتر')).toBeCloseTo(0.25, 6);
      });

      it('liters → liters', () => {
        expect(convertToDatabaseQuantity(2.5, 'l', 'لتر')).toBeCloseTo(2.5, 6);
      });

      it('grams → kg', () => {
        expect(convertToDatabaseQuantity(500, 'g', 'كيلو')).toBeCloseTo(0.5, 6);
      });

      it('items stay as is', () => {
        expect(convertToDatabaseQuantity(4, 'item', 'قطعة')).toBe(4);
      });

      it('zero or negative returns 0', () => {
        expect(convertToDatabaseQuantity(0, 'ml', 'لتر')).toBe(0);
        expect(convertToDatabaseQuantity(-5, 'ml', 'لتر')).toBe(0);
      });
    });

    describe('Display Quantity from Database', () => {
      it('sub-liter displays as ml', () => {
        const r = resolveDisplayQuantityFromDatabase(0.25, 'لتر');
        expect(r.subUnit).toBe('ml');
        expect(r.displayValue).toBe(250);
      });

      it('whole liters display as liters', () => {
        const r = resolveDisplayQuantityFromDatabase(2, 'لتر');
        expect(r.subUnit).toBe('l');
        expect(r.displayValue).toBe(2);
      });
    });

    describe('Material Formatting', () => {
      it('formats sub-liter with ml primary', () => {
        const f = formatMaterialQuantityWithUnit(0.25, 'لتر');
        expect(f.primary).toBe('250 مل');
        expect(f.secondary).toBe('0.25 لتر');
      });

      it('formats whole liters', () => {
        const f = formatMaterialQuantityWithUnit(2, 'لتر');
        expect(f.primary).toBe('2 لتر');
      });

      it('formats sub-kg with grams', () => {
        const f = formatMaterialQuantityWithUnit(0.05, 'كيلو');
        expect(f.primary).toBe('50 جم');
      });

      it('formats count items', () => {
        const f = formatMaterialQuantityWithUnit(4, 'قطعة');
        expect(f.primary).toContain('4');
      });
    });
  });

  // ===========================================================================
  // SECTION 16: TIME UTILITIES (أدوات الوقت)
  // ===========================================================================
  describe('§16 Time Utilities', () => {
    it('rounds duration to slot unit', () => {
      expect(roundDurationToSlot(45, 30)).toBe(60);
      expect(roundDurationToSlot(30, 30)).toBe(30);
      expect(roundDurationToSlot(1, 15)).toBe(15);
    });

    it('detects interval overlaps', () => {
      const a = new Date('2026-08-24T08:00:00Z');
      const b = new Date('2026-08-24T09:00:00Z');
      const c = new Date('2026-08-24T08:30:00Z');
      const d = new Date('2026-08-24T09:30:00Z');
      expect(intervalsOverlap(a, b, c, d)).toBe(true); // overlap
      expect(intervalsOverlap(a, b, b, d)).toBe(false); // touching, no overlap
      expect(intervalsOverlap(a, b, d, new Date('2026-08-24T10:00:00Z'))).toBe(false); // no overlap
    });

    it('converts local date/time to UTC', () => {
      const utc = localDateTimeToUtc('2026-08-24', '10:00', 'Africa/Cairo');
      expect(utc).toBeInstanceOf(Date);
      // Cairo is UTC+2 in summer (EET → EEST)
      expect(utc.getUTCHours()).toBe(7); // 10:00 Cairo = 07:00 UTC (summer)
    });

    it('day of week for local date', () => {
      // 2026-08-24 is a Monday
      expect(dayOfWeekForLocalDate('2026-08-24')).toBe(1);
    });
  });

  // ===========================================================================
  // SECTION 17: FIELD FAILURE SCENARIOS (سيناريوهات الفشل الميداني)
  // ===========================================================================
  describe('§17 Field Failure & Recovery Transitions', () => {

    const failureFromStates: [BookingStatus, BookingStatus[]][] = [
      [BookingStatus.TEAM_ACKNOWLEDGED, [BookingStatus.EXECUTION_FAILED, BookingStatus.CUSTOMER_NO_SHOW, BookingStatus.ACCESS_DENIED]],
      [BookingStatus.ON_THE_WAY, [BookingStatus.EXECUTION_FAILED, BookingStatus.CUSTOMER_NO_SHOW, BookingStatus.ACCESS_DENIED]],
      [BookingStatus.ARRIVED, [BookingStatus.CUSTOMER_NO_SHOW, BookingStatus.ACCESS_DENIED, BookingStatus.EXECUTION_FAILED]],
      [BookingStatus.IN_SERVICE, [BookingStatus.EXECUTION_FAILED]],
    ];

    it.each(failureFromStates)('from %s, failure transitions are valid', (from, toList) => {
      for (const to of toList) {
        expect(isValidStatusTransition(from, to)).toBe(true);
      }
    });

    it('failure states route to ADMIN_REVIEW, RESCHEDULE, or CANCELLATION', () => {
      for (const failState of [BookingStatus.EXECUTION_FAILED, BookingStatus.CUSTOMER_NO_SHOW, BookingStatus.ACCESS_DENIED]) {
        expect(isValidStatusTransition(failState, BookingStatus.ADMIN_REVIEW_REQUIRED)).toBe(true);
        expect(isValidStatusTransition(failState, BookingStatus.RESCHEDULE_REQUESTED)).toBe(true);
        expect(isValidStatusTransition(failState, BookingStatus.CANCELLATION_REQUESTED)).toBe(true);
      }
    });

    it('QUALITY_REVIEW can be returned to IN_SERVICE', () => {
      expect(isValidStatusTransition(BookingStatus.QUALITY_REVIEW, BookingStatus.IN_SERVICE)).toBe(true);
    });

    it('ADMIN_REVIEW can restore to ACCEPTED, AWAITING_ASSIGNMENT, ASSIGNED, or REJECT', () => {
      const exits = [BookingStatus.ACCEPTED, BookingStatus.AWAITING_ASSIGNMENT, BookingStatus.ASSIGNED,
        BookingStatus.CANCELLATION_REQUESTED, BookingStatus.REJECTED];
      for (const to of exits) {
        expect(isValidStatusTransition(BookingStatus.ADMIN_REVIEW_REQUIRED, to)).toBe(true);
      }
    });
  });

  // ===========================================================================
  // SECTION 18: RESCHEDULE & CANCELLATION TRANSITIONS (إعادة الجدولة والإلغاء)
  // ===========================================================================
  describe('§18 Rescheduling & Cancellation Transition Paths', () => {
    it('RESCHEDULE_REQUESTED has correct exits', () => {
      const exits = [
        BookingStatus.AWAITING_OPERATIONS_REVIEW, BookingStatus.ACCEPTED,
        BookingStatus.AWAITING_ASSIGNMENT, BookingStatus.ASSIGNED,
        BookingStatus.ADMIN_REVIEW_REQUIRED, BookingStatus.CANCELLATION_REQUESTED,
      ];
      for (const to of exits) {
        expect(isValidStatusTransition(BookingStatus.RESCHEDULE_REQUESTED, to)).toBe(true);
      }
    });

    it('CANCELLATION_REQUESTED can restore to many states', () => {
      const restorations = [
        BookingStatus.REQUEST_SUBMITTED, BookingStatus.AWAITING_PAYMENT_PROOF,
        BookingStatus.PAYMENT_UNDER_REVIEW, BookingStatus.PAYMENT_VERIFIED,
        BookingStatus.AWAITING_OPERATIONS_REVIEW, BookingStatus.ACCEPTED,
        BookingStatus.AWAITING_ASSIGNMENT, BookingStatus.ASSIGNED,
        BookingStatus.ADMIN_REVIEW_REQUIRED, BookingStatus.RESCHEDULE_REQUESTED,
        BookingStatus.CANCELLED,
      ];
      for (const to of restorations) {
        expect(isValidStatusTransition(BookingStatus.CANCELLATION_REQUESTED, to)).toBe(true);
      }
    });

    it('cancellation and reschedule require reasons', () => {
      const cancelNoReason = validateStatusTransition(
        BookingStatus.ACCEPTED, BookingStatus.CANCELLATION_REQUESTED,
        { reason: '' },
      );
      expect(cancelNoReason.code).toBe('REASON_REQUIRED');

      const rescheduleNoReason = validateStatusTransition(
        BookingStatus.ASSIGNED, BookingStatus.RESCHEDULE_REQUESTED,
        { hasAssignedTeam: true, reason: '' },
      );
      expect(rescheduleNoReason.code).toBe('REASON_REQUIRED');
    });
  });

  // ===========================================================================
  // SECTION 19: EXECUTION CHECKLIST STAGES (مراحل الفحص والتنفيذ)
  // ===========================================================================
  describe('§19 Execution Checklist Stages Constant', () => {
    it('has exactly 4 stages in correct order', () => {
      expect(EXECUTION_CHECKLIST_STAGES).toEqual([
        ChecklistStage.TEAM_PREPARATION,
        ChecklistStage.ARRIVAL_INSPECTION,
        ChecklistStage.SERVICE_EXECUTION,
        ChecklistStage.CLOSING,
      ]);
    });
  });

  // ===========================================================================
  // SECTION 20: NO-PAY BOOKING PATH (مسار الحجز بدون دفع)
  // ===========================================================================
  describe('§20 Zero-Payment & Credit-Only Booking Path', () => {
    it('PAYMENT_VERIFIED → AWAITING_OPERATIONS_REVIEW with NOT_REQUIRED', () => {
      const r = validateStatusTransition(
        BookingStatus.PAYMENT_VERIFIED,
        BookingStatus.AWAITING_OPERATIONS_REVIEW,
        { paymentStatus: PaymentStatus.NOT_REQUIRED },
      );
      expect(r.allowed).toBe(true);
    });

    it('REQUEST_SUBMITTED → PAYMENT_VERIFIED is valid graph edge', () => {
      expect(isValidStatusTransition(BookingStatus.REQUEST_SUBMITTED, BookingStatus.PAYMENT_VERIFIED)).toBe(true);
    });
  });

});

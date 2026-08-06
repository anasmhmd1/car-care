import { PermissionEffect, UserRole } from '@prisma/client';
import { db } from '@/lib/db';

export const PERMISSIONS = [
  'booking.accept',
  'booking.assign',
  'booking.view_unassigned',
  'booking.close',
  'booking.override_close',
  'booking.reschedule',
  'booking.release_hold',
  'payment.review',
  'payment.record_balance',
  'refund.record_proof',
  'refund.approve',
  'cancellation.review',
  'quality.review',
  'complaint.manage',
  'subscription.manage',
  'reports.revenue',
  'audit.view',
  'workforce.manage',
  'employee.manage',
  'task.execute',
  'catalog.price.manage',
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number];

const EMPLOYEE_DELEGATABLE_PERMISSIONS = new Set<PermissionCode>([
  'payment.review',
  'booking.accept',
  'booking.view_unassigned',
  'quality.review',
  'payment.record_balance',
  'refund.record_proof',
  'booking.close',
]);

export interface PermissionScope {
  type: 'GLOBAL' | 'BRANCH' | 'TEAM';
  id: string;
}

export interface BookingPermissionTarget {
  branchId: string;
  assignedTeamId?: string | null;
}

/**
 * A booking can be covered by both a branch and its assigned team. Passing
 * both scopes to the permission resolver is required so a DENY on either one
 * wins over defaults or a GRANT on the other scope.
 */
export function bookingPermissionScopes(
  booking: BookingPermissionTarget,
): PermissionScope[] {
  return [
    { type: 'BRANCH', id: booking.branchId },
    ...(booking.assignedTeamId
      ? [{ type: 'TEAM' as const, id: booking.assignedTeamId }]
      : []),
  ];
}

interface PermissionOverride {
  effect: PermissionEffect;
  scopeType: string;
  scopeId: string;
  expiresAt: Date | null;
}

const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<PermissionCode> | '*'> = {
  [UserRole.SYSTEM_SUPER_ADMIN]: '*',
  [UserRole.OWNER]: '*',
  [UserRole.OPERATIONS_MANAGER]: new Set([
    'booking.accept',
    'booking.assign',
    'booking.view_unassigned',
    'booking.close',
    'booking.override_close',
    'booking.reschedule',
    'booking.release_hold',
    'payment.review',
    'payment.record_balance',
    'refund.record_proof',
    'refund.approve',
    'cancellation.review',
    'quality.review',
    'complaint.manage',
    'subscription.manage',
    'reports.revenue',
    'audit.view',
    'workforce.manage',
    'task.execute',
  ]),
  [UserRole.EMPLOYEE]: new Set(['task.execute']),
  [UserRole.CUSTOMER]: new Set(),
};

export function roleHasDefaultPermission(role: UserRole, permission: PermissionCode) {
  const permissions = DEFAULT_ROLE_PERMISSIONS[role];
  return permissions === '*' || permissions.has(permission);
}

export function canRoleReceivePermission(
  role: UserRole,
  permission: PermissionCode,
) {
  return (
    role !== UserRole.EMPLOYEE || EMPLOYEE_DELEGATABLE_PERMISSIONS.has(permission)
  );
}

export function resolvePermissionDecision(input: {
  role: UserRole;
  permission: PermissionCode;
  explicitEffect?: PermissionEffect;
  configuredRolePermissions?: unknown;
}) {
  if (input.explicitEffect === PermissionEffect.DENY) return false;
  if (input.explicitEffect === PermissionEffect.GRANT) return true;

  const configured = input.configuredRolePermissions;
  if (Array.isArray(configured)) {
    if (configured.includes('*') || configured.includes(input.permission)) return true;
  } else if (configured && typeof configured === 'object') {
    const value = (configured as Record<string, unknown>)[input.permission];
    if (typeof value === 'boolean') return value;
  }

  return roleHasDefaultPermission(input.role, input.permission);
}

export function selectExplicitPermissionEffect(input: {
  overrides: PermissionOverride[];
  scope?: PermissionScope;
  now?: Date;
}): PermissionEffect | undefined {
  return selectExplicitPermissionEffectForScopes({
    overrides: input.overrides,
    scopes: input.scope ? [input.scope] : [],
    now: input.now,
  });
}

/**
 * Resolves all scopes that apply to one resource in a single decision. This is
 * important for bookings: a branch-level DENY must still win when the same
 * employee has a team-level GRANT.
 */
export function selectExplicitPermissionEffectForScopes(input: {
  overrides: PermissionOverride[];
  scopes?: readonly PermissionScope[];
  now?: Date;
}): PermissionEffect | undefined {
  const now = input.now ?? new Date();
  const scopeKeys = new Set(
    (input.scopes ?? []).map((scope) => `${scope.type}:${scope.id}`),
  );
  const applicable = input.overrides.filter((override) => {
    if (override.expiresAt && override.expiresAt <= now) return false;
    if (override.scopeType === 'GLOBAL' && override.scopeId === 'GLOBAL') return true;
    return scopeKeys.has(`${override.scopeType}:${override.scopeId}`);
  });
  if (applicable.some(({ effect }) => effect === PermissionEffect.DENY)) {
    return PermissionEffect.DENY;
  }
  if (applicable.some(({ effect }) => effect === PermissionEffect.GRANT)) {
    return PermissionEffect.GRANT;
  }
  return undefined;
}

export async function hasPermission(
  actor: { id: string; role: UserRole },
  permission: PermissionCode,
  scope?: PermissionScope,
) {
  return hasPermissionAcrossScopes(actor, permission, scope ? [scope] : []);
}

export async function hasPermissionAcrossScopes(
  actor: { id: string; role: UserRole },
  permission: PermissionCode,
  scopes: readonly PermissionScope[] = [],
) {
  const normalizedScopes = [
    ...new Map(
      scopes
        .filter((scope) => Boolean(scope.id))
        .map((scope) => [`${scope.type}:${scope.id}`, scope]),
    ).values(),
  ];
  const [overrides, roleConfiguration] = await Promise.all([
    db.userPermission.findMany({
      where: {
        userId: actor.id,
        permission: { code: permission },
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          {
            OR: [
              { scopeType: 'GLOBAL', scopeId: 'GLOBAL' },
              ...normalizedScopes.map((scope) => ({
                scopeType: scope.type,
                scopeId: scope.id,
              })),
            ],
          },
        ],
      },
      select: { effect: true, scopeType: true, scopeId: true, expiresAt: true },
    }),
    db.role.findUnique({
      where: { code: actor.role },
      select: { permissions: true },
    }),
  ]);

  return resolvePermissionDecision({
    role: actor.role,
    permission,
    explicitEffect: selectExplicitPermissionEffectForScopes({
      overrides,
      scopes: normalizedScopes,
    }),
    configuredRolePermissions: roleConfiguration?.permissions,
  });
}

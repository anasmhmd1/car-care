import { PermissionEffect, Prisma, UserRole } from '@prisma/client';
import {
  resolvePermissionDecision,
  selectExplicitPermissionEffectForScopes,
  type PermissionCode,
} from '@/lib/auth/permissions';

export interface BookingPermissionOverride {
  effect: PermissionEffect;
  scopeType: string;
  scopeId: string;
  expiresAt: Date | null;
}

export interface BookingPermissionFilterInput {
  role: UserRole;
  permission: PermissionCode;
  overrides: readonly BookingPermissionOverride[];
  configuredRolePermissions?: unknown;
  now?: Date;
}

export interface BookingPermissionTarget {
  branchId: string;
  assignedTeamId: string | null;
}

function activeOverrides(
  overrides: readonly BookingPermissionOverride[],
  now: Date,
) {
  return overrides.filter((override) => !override.expiresAt || override.expiresAt > now);
}

function scopeIds(
  overrides: readonly BookingPermissionOverride[],
  effect: PermissionEffect,
  scopeType: 'BRANCH' | 'TEAM',
) {
  return [
    ...new Set(
      overrides
        .filter((override) => override.effect === effect && override.scopeType === scopeType)
        .map((override) => override.scopeId)
        .filter(Boolean),
    ),
  ];
}

function explicitGlobalEffect(overrides: readonly BookingPermissionOverride[]) {
  if (overrides.some((override) => (
    override.scopeType === 'GLOBAL'
    && override.scopeId === 'GLOBAL'
    && override.effect === PermissionEffect.DENY
  ))) {
    return PermissionEffect.DENY;
  }

  if (overrides.some((override) => (
    override.scopeType === 'GLOBAL'
    && override.scopeId === 'GLOBAL'
    && override.effect === PermissionEffect.GRANT
  ))) {
    return PermissionEffect.GRANT;
  }

  return undefined;
}

function noBookingsWhere(): Prisma.BookingWhereInput {
  return { id: { in: [] } };
}

/**
 * Converts branch/team permission overrides into a Prisma predicate. The
 * predicate is semantically equivalent to `hasPermissionAcrossScopes` for a
 * booking: global or scoped DENY wins, and a scoped GRANT is required only
 * when the role/default configuration is otherwise denied.
 */
export function bookingPermissionWhere(
  input: BookingPermissionFilterInput,
): Prisma.BookingWhereInput {
  const now = input.now ?? new Date();
  const overrides = activeOverrides(input.overrides, now);
  const globalEffect = explicitGlobalEffect(overrides);

  if (globalEffect === PermissionEffect.DENY) return noBookingsWhere();

  const allowedByDefault = resolvePermissionDecision({
    role: input.role,
    permission: input.permission,
    explicitEffect: globalEffect,
    configuredRolePermissions: input.configuredRolePermissions,
  });
  const deniedBranchIds = scopeIds(overrides, PermissionEffect.DENY, 'BRANCH');
  const deniedTeamIds = scopeIds(overrides, PermissionEffect.DENY, 'TEAM');
  const deniedScopes: Prisma.BookingWhereInput[] = [
    ...(deniedBranchIds.length ? [{ branchId: { in: deniedBranchIds } }] : []),
    ...(deniedTeamIds.length ? [{ assignedTeamId: { in: deniedTeamIds } }] : []),
  ];
  const notDenied = deniedScopes.length ? [{ NOT: { OR: deniedScopes } }] : [];

  if (allowedByDefault) {
    return notDenied.length ? { AND: notDenied } : {};
  }

  const grantedBranchIds = scopeIds(overrides, PermissionEffect.GRANT, 'BRANCH');
  const grantedTeamIds = scopeIds(overrides, PermissionEffect.GRANT, 'TEAM');
  const grantedScopes: Prisma.BookingWhereInput[] = [
    ...(grantedBranchIds.length ? [{ branchId: { in: grantedBranchIds } }] : []),
    ...(grantedTeamIds.length ? [{ assignedTeamId: { in: grantedTeamIds } }] : []),
  ];

  if (!grantedScopes.length) return noBookingsWhere();

  return {
    AND: [
      { OR: grantedScopes },
      ...notDenied,
    ],
  };
}

export function canAccessBookingWithPermission(
  input: BookingPermissionFilterInput & { booking: BookingPermissionTarget },
) {
  const now = input.now ?? new Date();
  const overrides = activeOverrides(input.overrides, now);
  const explicitEffect = selectExplicitPermissionEffectForScopes({
    overrides,
    scopes: [
      { type: 'BRANCH', id: input.booking.branchId },
      ...(input.booking.assignedTeamId
        ? [{ type: 'TEAM' as const, id: input.booking.assignedTeamId }]
        : []),
    ],
    now,
  });

  return resolvePermissionDecision({
    role: input.role,
    permission: input.permission,
    explicitEffect,
    configuredRolePermissions: input.configuredRolePermissions,
  });
}

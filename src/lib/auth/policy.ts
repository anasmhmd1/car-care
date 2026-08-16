export const APP_ROLES = [
  'SYSTEM_SUPER_ADMIN',
  'OWNER',
  'OPERATIONS_MANAGER',
  'EMPLOYEE',
  'CUSTOMER',
] as const;

export type AppRole = (typeof APP_ROLES)[number];

const PROTECTED_ROUTE_ROLES: ReadonlyArray<{
  prefix: string;
  roles: readonly AppRole[];
  exact?: boolean;
}> = [
  { prefix: '/system-admin', roles: ['OWNER', 'SYSTEM_SUPER_ADMIN'] },
  {
    prefix: '/admin/calendar',
    roles: ['OPERATIONS_MANAGER', 'OWNER', 'SYSTEM_SUPER_ADMIN'],
  },
  {
    prefix: '/admin/reviews',
    roles: ['OPERATIONS_MANAGER', 'OWNER', 'SYSTEM_SUPER_ADMIN'],
  },
  {
    prefix: '/admin/reports',
    roles: ['OPERATIONS_MANAGER', 'OWNER', 'SYSTEM_SUPER_ADMIN'],
  },
  {
    prefix: '/admin/subscriptions',
    roles: ['OPERATIONS_MANAGER', 'OWNER', 'SYSTEM_SUPER_ADMIN'],
  },
  { prefix: '/admin', roles: ['OWNER', 'SYSTEM_SUPER_ADMIN'] },
  {
    prefix: '/operations',
    roles: ['OPERATIONS_MANAGER', 'OWNER', 'SYSTEM_SUPER_ADMIN'],
  },
  {
    prefix: '/staff',
    roles: ['EMPLOYEE', 'OPERATIONS_MANAGER', 'OWNER'],
  },
  { prefix: '/account/profile', roles: APP_ROLES, exact: true },
  { prefix: '/account', roles: ['CUSTOMER'] },
];

function pathMatchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && APP_ROLES.includes(value as AppRole);
}

export function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTE_ROLES.some(({ prefix, exact }) =>
    exact ? pathname === prefix : pathMatchesPrefix(pathname, prefix)
  );
}

export function canAccessRoute(role: AppRole, pathname: string): boolean {
  const policy = PROTECTED_ROUTE_ROLES.find(({ prefix, exact }) =>
    exact ? pathname === prefix : pathMatchesPrefix(pathname, prefix)
  );

  return !policy || policy.roles.includes(role);
}

export function getHomeRouteForRole(role: AppRole): string {
  switch (role) {
    case 'SYSTEM_SUPER_ADMIN':
      return '/system-admin';
    case 'OWNER':
      return '/admin';
    case 'OPERATIONS_MANAGER':
      return '/operations';
    case 'EMPLOYEE':
      return '/staff';
    case 'CUSTOMER':
      return '/account';
  }
}

export function hasBrandWideBranchAccess(role: AppRole): boolean {
  return role === 'SYSTEM_SUPER_ADMIN' || role === 'OWNER';
}

const WORKFORCE_ROLES: readonly AppRole[] = [
  'OPERATIONS_MANAGER',
  'EMPLOYEE',
];

/**
 * Owner workforce actions never manage Owner/System Admin accounts. Operations
 * Managers can update Employees only and cannot promote them.
 */
export function canManageWorkforceAccount(
  actorRole: AppRole,
  targetRole: AppRole,
  nextRole: AppRole = targetRole
): boolean {
  if (
    !WORKFORCE_ROLES.includes(targetRole) ||
    !WORKFORCE_ROLES.includes(nextRole)
  ) {
    return false;
  }

  if (actorRole === 'SYSTEM_SUPER_ADMIN' || actorRole === 'OWNER') {
    return true;
  }

  return (
    actorRole === 'OPERATIONS_MANAGER' &&
    targetRole === 'EMPLOYEE' &&
    nextRole === 'EMPLOYEE'
  );
}

/**
 * Prevents branch-scoped managers from mutating a shared workforce account
 * through one visible membership while another membership is outside their
 * authority. Brand-wide actors pass `null` for unrestricted scope.
 */
export function isWorkforceAccountWithinManagedBranches(
  targetBranchIds: readonly string[],
  managedBranchIds: ReadonlySet<string> | null,
): boolean {
  if (managedBranchIds === null) return true;
  return (
    targetBranchIds.length > 0 &&
    targetBranchIds.every((branchId) => managedBranchIds.has(branchId))
  );
}

import type { Prisma, User } from '@prisma/client';
import { db } from '@/lib/db';
import {
  hasBrandWideBranchAccess,
  type AppRole,
} from '@/lib/auth/policy';

export type AuthActor = Pick<User, 'id' | 'role'>;

export const publicUserSelect = {
  id: true,
  fullName: true,
  phone: true,
  whatsapp: true,
  email: true,
  role: true,
  active: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{
  select: typeof publicUserSelect;
}>;

type PublicUserSource = Pick<
  User,
  | 'id'
  | 'fullName'
  | 'phone'
  | 'whatsapp'
  | 'email'
  | 'role'
  | 'active'
>;

export function toPublicUser(user: PublicUserSource): PublicUser {
  return {
    id: user.id,
    fullName: user.fullName,
    phone: user.phone,
    whatsapp: user.whatsapp,
    email: user.email,
    role: user.role,
    active: user.active,
  };
}

const CLIENT_SENSITIVE_KEYS = new Set([
  'passwordHash',
  'tempPasswordHash',
  'mustChangePwd',
  'deletedAt',
]);

/**
 * Defense-in-depth for relation-heavy dashboard payloads. Prisma records are
 * plain objects; Dates and other non-plain values are preserved as-is.
 */
export function sanitizeClientData<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeClientData(item)) as T;
  }

  if (value === null || typeof value !== 'object' || value instanceof Date) {
    return value;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !CLIENT_SENSITIVE_KEYS.has(key))
      .map(([key, nestedValue]) => [key, sanitizeClientData(nestedValue)])
  ) as T;
}

export async function getAccessibleBranchIds(
  actor: AuthActor
): Promise<string[] | null> {
  if (hasBrandWideBranchAccess(actor.role as AppRole)) {
    return null;
  }

  if (actor.role !== 'OPERATIONS_MANAGER' && actor.role !== 'EMPLOYEE') {
    return [];
  }

  const memberships = await db.branchMembership.findMany({
    where: { userId: actor.id },
    select: { branchId: true },
  });

  if (actor.role === 'OPERATIONS_MANAGER') {
    return memberships.map(({ branchId }) => branchId);
  }

  const teamMemberships = await db.teamMember.findMany({
    where: { userId: actor.id },
    select: { team: { select: { branchId: true } } },
  });

  return [
    ...new Set([
      ...memberships.map(({ branchId }) => branchId),
      ...teamMemberships.map(({ team }) => team.branchId),
    ]),
  ];
}

export async function canAccessBranch(
  actor: AuthActor,
  branchId: string
): Promise<boolean> {
  if (!branchId) return false;
  if (hasBrandWideBranchAccess(actor.role as AppRole)) return true;

  const branchIds = await getAccessibleBranchIds(actor);
  return branchIds?.includes(branchId) ?? false;
}

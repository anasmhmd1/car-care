import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { UserRole } from '@prisma/client';
import { getAccessibleBranchIds } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import OperationsWorkforceBoard, {
  type OperationsWorkforceBranchDto,
  type OperationsWorkforceEmployeeDto,
  type OperationsWorkforceServiceDto,
} from './OperationsWorkforceBoard';

export const metadata: Metadata = {
  title: 'إدارة القوى العاملة | بريق',
  description: 'إدارة موظفي وفرق ودوام وإجازات الفروع المسموح بها.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = [
  UserRole.OPERATIONS_MANAGER,
  UserRole.OWNER,
  UserRole.SYSTEM_SUPER_ADMIN,
];

export default async function OperationsWorkforcePage() {
  const actor = await requireRole(ALLOWED_ROLES);
  if (!(await hasPermission(actor, 'workforce.manage'))) redirect('/operations');

  const accessibleBranchIds = await getAccessibleBranchIds(actor);
  const candidateBranchIds = accessibleBranchIds ?? (
    await db.branch.findMany({ select: { id: true } })
  ).map(({ id }) => id);
  const permissionChecks = await Promise.all(
    candidateBranchIds.map(async (branchId) => ({
      branchId,
      allowed: await hasPermission(actor, 'workforce.manage', { type: 'BRANCH', id: branchId }),
    })),
  );
  const permittedBranchIds = permissionChecks
    .filter(({ allowed }) => allowed)
    .map(({ branchId }) => branchId);
  const employeeManagementChecks = await Promise.all(
    permittedBranchIds.map(async (branchId) => ({
      branchId,
      allowed: await hasPermission(actor, 'employee.manage', { type: 'BRANCH', id: branchId }),
    })),
  );
  const employeeManagementBranchIds = employeeManagementChecks
    .filter(({ allowed }) => allowed)
    .map(({ branchId }) => branchId);
  const manageableEmployeeRoles = actor.role === UserRole.OPERATIONS_MANAGER
    ? [UserRole.EMPLOYEE]
    : [UserRole.EMPLOYEE, UserRole.OPERATIONS_MANAGER];

  const branchesPromise = db.branch.findMany({
    where: { id: { in: permittedBranchIds } },
    orderBy: [{ status: 'asc' }, { nameAr: 'asc' }],
    select: {
      id: true,
      code: true,
      nameAr: true,
      status: true,
      timezone: true,
      workingHours: {
        orderBy: { dayOfWeek: 'asc' },
        select: {
          dayOfWeek: true,
          isClosed: true,
          openTime: true,
          closeTime: true,
          breakStartTime: true,
          breakEndTime: true,
        },
      },
      coverageZones: {
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      },
      teams: {
        orderBy: [{ active: 'desc' }, { assignmentPriority: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          leaderId: true,
          baseZoneId: true,
          dailyCapacity: true,
          active: true,
          assignmentPriority: true,
          members: { select: { userId: true } },
          capabilities: { select: { serviceId: true } },
          teamZones: { select: { zoneId: true } },
          workingHours: {
            orderBy: { dayOfWeek: 'asc' },
            select: {
              id: true,
              dayOfWeek: true,
              isOff: true,
              openTime: true,
              closeTime: true,
              breakStartTime: true,
              breakEndTime: true,
            },
          },
          timeOff: {
            orderBy: { startDate: 'asc' },
            select: { id: true, startDate: true, endDate: true, reason: true },
          },
        },
      },
    },
  });
  const employeesPromise = db.user.findMany({
    where: {
      role: { in: manageableEmployeeRoles },
      branchMemberships: {
        some: { branchId: { in: permittedBranchIds } },
        ...(actor.role === UserRole.OPERATIONS_MANAGER
          ? { every: { branchId: { in: permittedBranchIds } } }
          : {}),
      },
    },
    orderBy: [{ active: 'desc' }, { fullName: 'asc' }],
    select: {
      id: true,
      fullName: true,
      phone: true,
      whatsapp: true,
      email: true,
      role: true,
      active: true,
      branchMemberships: {
        where: { branchId: { in: permittedBranchIds } },
        select: { branchId: true },
      },
      teamMemberships: { select: { teamId: true } },
      employeeTimeOff: {
        orderBy: { startDate: 'asc' },
        select: { id: true, startDate: true, endDate: true, reason: true },
      },
    },
  });
  const servicesPromise = db.service.findMany({
    where: { active: true },
    orderBy: { nameAr: 'asc' },
    select: { id: true, nameAr: true },
  });

  const [branchesRaw, employeesRaw, servicesRaw] = await Promise.all([
    branchesPromise,
    employeesPromise,
    servicesPromise,
  ]);

  const branches: OperationsWorkforceBranchDto[] = branchesRaw.map((branch) => ({
    id: branch.id,
    code: branch.code,
    nameAr: branch.nameAr,
    status: branch.status,
    timezone: branch.timezone,
    workingHours: branch.workingHours,
    zones: branch.coverageZones,
    teams: branch.teams.map((team) => ({
      id: team.id,
      name: team.name,
      leaderId: team.leaderId,
      baseZoneId: team.baseZoneId,
      dailyCapacity: team.dailyCapacity,
      active: team.active,
      assignmentPriority: team.assignmentPriority,
      memberIds: team.members.map(({ userId }) => userId),
      serviceIds: team.capabilities.map(({ serviceId }) => serviceId),
      zoneIds: team.teamZones.map(({ zoneId }) => zoneId),
      workingHours: team.workingHours,
      timeOff: team.timeOff.map((timeOff) => ({
        id: timeOff.id,
        startDate: timeOff.startDate.toISOString(),
        endDate: timeOff.endDate.toISOString(),
        reason: timeOff.reason,
      })),
    })),
  }));
  const employees: OperationsWorkforceEmployeeDto[] = employeesRaw.map((employee) => ({
    id: employee.id,
    fullName: employee.fullName,
    phone: employee.phone,
    whatsapp: employee.whatsapp,
    email: employee.email,
    role: employee.role === UserRole.OPERATIONS_MANAGER
      ? UserRole.OPERATIONS_MANAGER
      : UserRole.EMPLOYEE,
    active: employee.active,
    branchIds: employee.branchMemberships.map(({ branchId }) => branchId),
    teamId: employee.teamMemberships[0]?.teamId ?? null,
    timeOff: employee.employeeTimeOff.map((timeOff) => ({
      id: timeOff.id,
      startDate: timeOff.startDate.toISOString(),
      endDate: timeOff.endDate.toISOString(),
      reason: timeOff.reason,
    })),
  }));
  const services: OperationsWorkforceServiceDto[] = servicesRaw;

  return (
    <OperationsWorkforceBoard
      actor={{
        fullName: actor.fullName,
        role: actor.role === UserRole.OPERATIONS_MANAGER
          ? UserRole.OPERATIONS_MANAGER
          : actor.role === UserRole.SYSTEM_SUPER_ADMIN
            ? UserRole.SYSTEM_SUPER_ADMIN
            : UserRole.OWNER,
      }}
      branches={branches}
      employees={employees}
      employeeManagementBranchIds={employeeManagementBranchIds}
      services={services}
    />
  );
}

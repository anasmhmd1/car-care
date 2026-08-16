import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { UserRole } from '@prisma/client';
import {
  canRoleReceivePermission,
  hasPermission,
  PERMISSIONS,
  roleHasDefaultPermission,
} from '@/lib/auth/permissions';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import SetupCenter, {
  type SetupBranchDto,
  type SetupEmployeeDto,
  type SetupPermissionDto,
  type SetupServiceDto,
} from './SetupCenter';

export const metadata: Metadata = {
  title: 'مركز إعداد التشغيل | بريق',
  description: 'إعداد الفرق والتغطية والساعات والدفع وقوائم التنفيذ.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const actor = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);
  if (!(await hasPermission(actor, 'workforce.manage'))) redirect('/admin');
  const branchesPromise = db.branch.findMany({
    orderBy: [{ status: 'asc' }, { nameAr: 'asc' }],
    select: {
      id: true,
      code: true,
      nameAr: true,
      nameEn: true,
      address: true,
      phone: true,
      whatsapp: true,
      status: true,
      timezone: true,
      slotUnitMinutes: true,
      arrivalWindowMinutes: true,
      travelBufferMinutes: true,
      restBufferMinutes: true,
      dailyBookingLimit: true,
      assignmentMode: true,
      workingHours: {
        orderBy: { dayOfWeek: 'asc' },
        select: {
          id: true,
          dayOfWeek: true,
          isClosed: true,
          openTime: true,
          closeTime: true,
          breakStartTime: true,
          breakEndTime: true,
        },
      },
      blackoutDates: {
        orderBy: { date: 'asc' },
        select: { id: true, date: true, reason: true },
      },
      paymentMethods: {
        orderBy: [{ isDefault: 'desc' }, { active: 'desc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          type: true,
          accountNumber: true,
          accountName: true,
          instructions: true,
          active: true,
          isDefault: true,
          _count: { select: { proofs: true } },
        },
      },
      coverageZones: {
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          description: true,
          areas: {
            orderBy: [{ priority: 'asc' }, { compound: 'asc' }],
            select: {
              id: true,
              governorate: true,
              city: true,
              district: true,
              compound: true,
              active: true,
              priority: true,
              travelBufferOverride: true,
              _count: { select: { bookings: true } },
            },
          },
        },
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
          members: {
            orderBy: [{ isLeader: 'desc' }, { user: { fullName: 'asc' } }],
            select: { userId: true, isLeader: true },
          },
          teamZones: { select: { zoneId: true } },
          capabilities: { select: { serviceId: true } },
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
            select: {
              id: true,
              startDate: true,
              endDate: true,
              reason: true,
            },
          },
          _count: { select: { bookings: true } },
        },
      },
    },
  });
  const employeesPromise = db.user.findMany({
    where: {
      role: { in: [UserRole.OPERATIONS_MANAGER, UserRole.EMPLOYEE] },
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
        select: { branchId: true },
      },
      teamMemberships: {
        select: { teamId: true },
      },
      employeeTimeOff: {
        orderBy: { startDate: 'asc' },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          reason: true,
        },
      },
      userPermissions: {
        where: {
          scopeType: { in: ['GLOBAL', 'BRANCH'] },
          permission: { code: { in: [...PERMISSIONS] } },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          effect: true,
          scopeType: true,
          scopeId: true,
          expiresAt: true,
          permission: { select: { code: true } },
        },
      },
    },
  });
  const servicesPromise = db.service.findMany({
    orderBy: [{ active: 'desc' }, { nameAr: 'asc' }],
    select: {
      id: true,
      nameAr: true,
      active: true,
      cancellationPolicyId: true,
      cancellationPolicy: {
        select: { nameAr: true, active: true },
      },
      checklistTemplates: {
        orderBy: [{ stage: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          stage: true,
          name: true,
          items: {
            orderBy: [{ displayOrder: 'asc' }, { labelAr: 'asc' }],
            select: {
              id: true,
              labelAr: true,
              descriptionAr: true,
              required: true,
              requiresPhoto: true,
              requiresNote: true,
              displayOrder: true,
              active: true,
            },
          },
        },
      },
    },
  });
  const travelTimesPromise = db.zoneTravelTime.findMany({
    orderBy: [{ fromZoneId: 'asc' }, { toZoneId: 'asc' }],
    select: {
      id: true,
      fromZoneId: true,
      toZoneId: true,
      durationMinutes: true,
      fromZone: { select: { branchId: true } },
    },
  });
  const permissionsPromise = db.permission.findMany({
    where: { code: { in: [...PERMISSIONS] } },
    select: { code: true, nameAr: true, description: true },
  });

  const [branchesRaw, employeesRaw, servicesRaw, travelTimesRaw, permissionsRaw] = await Promise.all([
    branchesPromise,
    employeesPromise,
    servicesPromise,
    travelTimesPromise,
    permissionsPromise,
  ]);

  const branches: SetupBranchDto[] = branchesRaw.map((branch) => ({
    id: branch.id,
    code: branch.code,
    nameAr: branch.nameAr,
    nameEn: branch.nameEn,
    address: branch.address,
    phone: branch.phone,
    whatsapp: branch.whatsapp,
    status: branch.status,
    timezone: branch.timezone,
    slotUnitMinutes: branch.slotUnitMinutes,
    arrivalWindowMinutes: branch.arrivalWindowMinutes,
    travelBufferMinutes: branch.travelBufferMinutes,
    restBufferMinutes: branch.restBufferMinutes,
    dailyBookingLimit: branch.dailyBookingLimit,
    assignmentMode: branch.assignmentMode,
    workingHours: branch.workingHours,
    blackoutDates: branch.blackoutDates.map((blackout) => ({
      id: blackout.id,
      date: blackout.date.toISOString().slice(0, 10),
      reason: blackout.reason,
    })),
    paymentMethods: branch.paymentMethods.map((method) => ({
      id: method.id,
      name: method.name,
      type: method.type,
      accountNumber: method.accountNumber,
      accountName: method.accountName,
      instructions: method.instructions,
      active: method.active,
      isDefault: method.isDefault,
      proofCount: method._count.proofs,
    })),
    zones: branch.coverageZones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      description: zone.description,
      areas: zone.areas.map((area) => ({
        id: area.id,
        governorate: area.governorate,
        city: area.city,
        district: area.district,
        compound: area.compound,
        active: area.active,
        priority: area.priority,
        travelBufferOverride: area.travelBufferOverride,
        bookingCount: area._count.bookings,
      })),
    })),
    teams: branch.teams.map((team) => ({
      id: team.id,
      name: team.name,
      leaderId: team.leaderId,
      baseZoneId: team.baseZoneId,
      dailyCapacity: team.dailyCapacity,
      active: team.active,
      assignmentPriority: team.assignmentPriority,
      memberIds: team.members.map((member) => member.userId),
      zoneIds: team.teamZones.map((zone) => zone.zoneId),
      serviceIds: team.capabilities.map((capability) => capability.serviceId),
      workingHours: team.workingHours,
      timeOff: team.timeOff.map((timeOff) => ({
        id: timeOff.id,
        startDate: timeOff.startDate.toISOString(),
        endDate: timeOff.endDate.toISOString(),
        reason: timeOff.reason,
      })),
      bookingCount: team._count.bookings,
    })),
    travelTimes: travelTimesRaw
      .filter((travel) => travel.fromZone.branchId === branch.id)
      .map((travel) => ({
        id: travel.id,
        fromZoneId: travel.fromZoneId,
        toZoneId: travel.toZoneId,
        durationMinutes: travel.durationMinutes,
      })),
  }));

  const employees: SetupEmployeeDto[] = employeesRaw.map((employee) => ({
    id: employee.id,
    fullName: employee.fullName,
    phone: employee.phone,
    whatsapp: employee.whatsapp,
    email: employee.email,
    role:
      employee.role === UserRole.OPERATIONS_MANAGER
        ? UserRole.OPERATIONS_MANAGER
        : UserRole.EMPLOYEE,
    active: employee.active,
    branchIds: employee.branchMemberships.map((membership) => membership.branchId),
    teamId: employee.teamMemberships[0]?.teamId ?? null,
    timeOff: employee.employeeTimeOff.map((timeOff) => ({
      id: timeOff.id,
      startDate: timeOff.startDate.toISOString(),
      endDate: timeOff.endDate.toISOString(),
      reason: timeOff.reason,
    })),
    permissionOverrides: employee.userPermissions.map((override) => ({
      id: override.id,
      permissionCode: override.permission.code,
      effect: override.effect,
      scopeType: override.scopeType === 'BRANCH' ? 'BRANCH' : 'GLOBAL',
      scopeId: override.scopeId,
      expiresAt: override.expiresAt?.toISOString() ?? null,
    })),
  }));

  const permissionRecords = new Map(permissionsRaw.map((permission) => [permission.code, permission]));
  const permissions: SetupPermissionDto[] = PERMISSIONS.map((code) => ({
    code,
    nameAr: permissionRecords.get(code)?.nameAr ?? code,
    description: permissionRecords.get(code)?.description ?? null,
    canGrantToEmployee: canRoleReceivePermission(UserRole.EMPLOYEE, code),
    defaultForEmployee: roleHasDefaultPermission(UserRole.EMPLOYEE, code),
    defaultForOperationsManager: roleHasDefaultPermission(UserRole.OPERATIONS_MANAGER, code),
  }));

  const services: SetupServiceDto[] = servicesRaw.map((service) => ({
    id: service.id,
    nameAr: service.nameAr,
    active: service.active,
    cancellationPolicyId: service.cancellationPolicyId,
    cancellationPolicyNameAr: service.cancellationPolicy.nameAr,
    cancellationPolicyActive: service.cancellationPolicy.active,
    checklistTemplates: service.checklistTemplates,
  }));

  return (
    <SetupCenter
      actor={{
        fullName: actor.fullName,
        role:
          actor.role === UserRole.SYSTEM_SUPER_ADMIN
            ? UserRole.SYSTEM_SUPER_ADMIN
            : UserRole.OWNER,
      }}
      branches={branches}
      employees={employees}
      permissions={permissions}
      services={services}
    />
  );
}

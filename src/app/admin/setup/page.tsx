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
      materialRequirements: {
        orderBy: [{ required: 'desc' }, { material: { nameAr: 'asc' } }],
        select: {
          id: true,
          materialId: true,
          quantity: true,
          required: true,
          notes: true,
          material: { select: { nameAr: true, sku: true, unit: true, active: true } },
        },
      },
    },
  });

  const materialsPromise = db.material.findMany({
    orderBy: [{ active: 'desc' }, { nameAr: 'asc' }],
    select: {
      id: true,
      sku: true,
      nameAr: true,
      nameEn: true,
      unit: true,
      defaultReorderPoint: true,
      active: true,
      _count: { select: { serviceRequirements: true, branchStocks: true } },
    },
  });

  const stocksPromise = db.branchMaterialStock.findMany({
    orderBy: [{ branch: { nameAr: 'asc' } }, { material: { nameAr: 'asc' } }],
    select: {
      id: true,
      branchId: true,
      materialId: true,
      quantityOnHand: true,
      reservedQuantity: true,
      reorderPoint: true,
      active: true,
      updatedAt: true,
      branch: { select: { nameAr: true } },
      material: { select: { nameAr: true, sku: true, unit: true, defaultReorderPoint: true, active: true } },
      movements: {
        take: 6,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          quantityChange: true,
          balanceAfter: true,
          reason: true,
          createdAt: true,
          booking: { select: { bookingNumber: true } },
          createdBy: { select: { fullName: true } },
        },
      },
    },
  });

  const vehiclesPromise = db.operationalVehicle.findMany({
    orderBy: [{ branch: { nameAr: 'asc' } }, { status: 'asc' }, { code: 'asc' }],
    select: {
      id: true,
      branchId: true,
      teamId: true,
      code: true,
      plateNumber: true,
      make: true,
      model: true,
      year: true,
      status: true,
      notes: true,
      branch: { select: { nameAr: true } },
      team: { select: { name: true } },
      _count: { select: { bookings: true } },
    },
  });

  const employeeStocksPromise = db.employeeMaterialStock.findMany({
    orderBy: [{ employee: { fullName: 'asc' } }, { material: { nameAr: 'asc' } }],
    select: {
      id: true,
      employeeId: true,
      materialId: true,
      quantityOnHand: true,
      minAlertLevel: true,
      active: true,
      updatedAt: true,
      employee: { select: { id: true, fullName: true, phone: true } },
      material: { select: { nameAr: true, sku: true, unit: true } },
      movements: {
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          quantityChange: true,
          balanceAfter: true,
          reason: true,
          createdAt: true,
          booking: { select: { bookingNumber: true } },
          createdBy: { select: { fullName: true } },
        },
      },
    },
  });

  const resourceBookingsPromise = db.booking.findMany({
    where: {
      assignedTeamId: { not: null },
      deletedAt: null,
      bookingStatus: { notIn: ['CANCELLED', 'REJECTED', 'EXPIRED', 'CLOSED'] },
    },
    take: 120,
    orderBy: { startAt: 'asc' },
    select: {
      id: true,
      branchId: true,
      bookingNumber: true,
      startAt: true,
      endAt: true,
      bookingStatus: true,
      assignedTeamId: true,
      assignedEmployeeId: true,
      operationalVehicleId: true,
      service: { select: { nameAr: true } },
      branch: { select: { nameAr: true } },
      assignedTeam: { select: { name: true } },
      assignedEmployee: { select: { fullName: true } },
      operationalVehicle: { select: { code: true, plateNumber: true, make: true, model: true } },
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

  const [
    branchesRaw,
    employeesRaw,
    servicesRaw,
    travelTimesRaw,
    permissionsRaw,
    materialsRaw,
    stocksRaw,
    vehiclesRaw,
    employeeStocksRaw,
    bookingsRaw,
  ] = await Promise.all([
    branchesPromise,
    employeesPromise,
    servicesPromise,
    travelTimesPromise,
    permissionsPromise,
    materialsPromise,
    stocksPromise,
    vehiclesPromise,
    employeeStocksPromise,
    resourceBookingsPromise,
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

  const inventoryMaterials = materialsRaw.map((material) => ({
    id: material.id,
    sku: material.sku,
    nameAr: material.nameAr,
    nameEn: material.nameEn,
    unit: material.unit,
    defaultReorderPoint: material.defaultReorderPoint,
    active: material.active,
    requirementCount: material._count.serviceRequirements,
    stockCount: material._count.branchStocks,
  }));

  const inventoryServices = servicesRaw.map((service) => ({
    id: service.id,
    nameAr: service.nameAr,
    active: service.active,
    materialRequirements: service.materialRequirements,
  }));

  const inventoryStocks = stocksRaw.map((stock) => ({
    id: stock.id,
    branchId: stock.branchId,
    materialId: stock.materialId,
    quantityOnHand: stock.quantityOnHand,
    reservedQuantity: stock.reservedQuantity,
    reorderPoint: stock.reorderPoint,
    active: stock.active,
    updatedAt: stock.updatedAt.toISOString(),
    branchName: stock.branch.nameAr,
    material: stock.material,
    movements: stock.movements.map((movement) => ({
      id: movement.id,
      type: movement.type,
      quantityChange: movement.quantityChange,
      balanceAfter: movement.balanceAfter,
      reason: movement.reason,
      createdAt: movement.createdAt.toISOString(),
      bookingNumber: movement.booking?.bookingNumber ?? null,
      createdByName: movement.createdBy.fullName,
    })),
  }));

  const inventoryEmployeeStocks = employeeStocksRaw.map((stock) => ({
    id: stock.id,
    employeeId: stock.employeeId,
    materialId: stock.materialId,
    quantityOnHand: stock.quantityOnHand,
    minAlertLevel: stock.minAlertLevel,
    active: stock.active,
    updatedAt: stock.updatedAt.toISOString(),
    employeeName: stock.employee.fullName,
    employeePhone: stock.employee.phone,
    materialName: stock.material.nameAr,
    materialSku: stock.material.sku,
    materialUnit: stock.material.unit,
    movements: stock.movements.map((movement) => ({
      id: movement.id,
      type: movement.type,
      quantityChange: movement.quantityChange,
      balanceAfter: movement.balanceAfter,
      reason: movement.reason,
      createdAt: movement.createdAt.toISOString(),
      bookingNumber: movement.booking?.bookingNumber ?? null,
      createdByName: movement.createdBy.fullName,
    })),
  }));

  const inventoryEmployees = employeesRaw.map((employee) => ({
    id: employee.id,
    fullName: employee.fullName,
    phone: employee.phone,
    role: employee.role,
    teamName: undefined,
    branchName: undefined,
  }));

  const inventoryVehicles = vehiclesRaw.map((vehicle) => ({
    id: vehicle.id,
    branchId: vehicle.branchId,
    teamId: vehicle.teamId,
    code: vehicle.code,
    plateNumber: vehicle.plateNumber,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    status: vehicle.status,
    notes: vehicle.notes,
    branchName: vehicle.branch.nameAr,
    teamName: vehicle.team?.name ?? null,
    bookingCount: vehicle._count.bookings,
  }));

  const inventoryBookings = bookingsRaw.map((booking) => ({
    id: booking.id,
    branchId: booking.branchId,
    bookingNumber: booking.bookingNumber,
    startAt: booking.startAt.toISOString(),
    endAt: booking.endAt.toISOString(),
    bookingStatus: booking.bookingStatus,
    assignedTeamId: booking.assignedTeamId!,
    assignedEmployeeId: booking.assignedEmployeeId,
    operationalVehicleId: booking.operationalVehicleId,
    branchName: booking.branch.nameAr,
    serviceName: booking.service.nameAr,
    teamName: booking.assignedTeam?.name ?? 'فريق غير محدد',
    employeeName: booking.assignedEmployee?.fullName ?? null,
    operationalVehicleLabel: booking.operationalVehicle
      ? `${booking.operationalVehicle.code} · ${booking.operationalVehicle.make} ${booking.operationalVehicle.model}`
      : null,
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
      inventory={{
        materials: inventoryMaterials,
        services: inventoryServices,
        stocks: inventoryStocks,
        employeeStocks: inventoryEmployeeStocks,
        employees: inventoryEmployees,
        vehicles: inventoryVehicles,
        bookings: inventoryBookings,
      }}
    />
  );
}

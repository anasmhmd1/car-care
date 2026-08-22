import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { UserRole } from '@prisma/client';
import { getAccessibleBranchIds } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import OperationsResourcesBoard, {
  type OperationsEmployeeDto,
  type ResourceBookingDto,
  type ResourceBranchDto,
  type ResourceMaterialDto,
  type ResourceStockDto,
  type ResourceVehicleDto,
  type ServiceMaterialDto,
} from './OperationsResourcesBoard';

export const metadata: Metadata = {
  title: 'الموارد التشغيلية | بريق',
  description: 'إدارة مواد الخدمات، مخزون سيارات التشغيل، وأسطول وحدات التنفيذ المتنقلة.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const RESOURCE_ROLES = [
  UserRole.OPERATIONS_MANAGER,
  UserRole.OWNER,
  UserRole.SYSTEM_SUPER_ADMIN,
] as const;

const TERMINAL_BOOKING_STATUSES = [
  'CANCELLED',
  'REJECTED',
  'EXPIRED',
  'CLOSED',
] as const;

export default async function OperationsResourcesPage() {
  const actor = await requireRole([...RESOURCE_ROLES]);
  const accessibleBranchIds = await getAccessibleBranchIds(actor);
  const candidateBranchIds = accessibleBranchIds ?? (
    await db.branch.findMany({ select: { id: true } })
  ).map(({ id }) => id);
  const permittedBranchIds = (await Promise.all(
    candidateBranchIds.map(async (branchId) => ({
      branchId,
      allowed: await hasPermission(actor, 'workforce.manage', { type: 'BRANCH', id: branchId }),
    })),
  )).filter(({ allowed }) => allowed).map(({ branchId }) => branchId);

  if (permittedBranchIds.length === 0) redirect('/operations');

  const canManageCatalog = actor.role === UserRole.OWNER || actor.role === UserRole.SYSTEM_SUPER_ADMIN;
  const [branchesRaw, materialsRaw, servicesRaw, stocksRaw, vehiclesRaw, bookingsRaw, employeeStocksRaw, employeesRaw] = await Promise.all([
    db.branch.findMany({
      where: { id: { in: permittedBranchIds } },
      orderBy: { nameAr: 'asc' },
      select: {
        id: true,
        code: true,
        nameAr: true,
        status: true,
        teams: {
          where: { active: true },
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            members: {
              where: { user: { active: true, deletedAt: null } },
              orderBy: { user: { fullName: 'asc' } },
              select: { user: { select: { id: true, fullName: true } } },
            },
          },
        },
      },
    }),
    db.material.findMany({
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
    }),
    db.service.findMany({
      where: canManageCatalog ? {} : { active: true },
      orderBy: [{ active: 'desc' }, { nameAr: 'asc' }],
      select: {
        id: true,
        nameAr: true,
        active: true,
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
    }),
    db.branchMaterialStock.findMany({
      where: { branchId: { in: permittedBranchIds } },
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
    }),
    db.operationalVehicle.findMany({
      where: { branchId: { in: permittedBranchIds } },
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
    }),
    db.booking.findMany({
      where: {
        branchId: { in: permittedBranchIds },
        assignedTeamId: { not: null },
        deletedAt: null,
        bookingStatus: { notIn: [...TERMINAL_BOOKING_STATUSES] },
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
        operationalVehicle: { select: { code: true, make: true, model: true } },
      },
    }),
    db.employeeMaterialStock.findMany({
      where: {
        employee: {
          teamMemberships: {
            some: { team: { branchId: { in: permittedBranchIds } } },
          },
        },
      },
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
    }),
    db.user.findMany({
      where: {
        role: { in: [UserRole.EMPLOYEE, UserRole.OPERATIONS_MANAGER] },
        active: true,
        deletedAt: null,
        OR: [
          { teamMemberships: { some: { team: { branchId: { in: permittedBranchIds } } } } },
          { branchMemberships: { some: { branchId: { in: permittedBranchIds } } } },
        ],
      },
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        fullName: true,
        phone: true,
        role: true,
        teamMemberships: {
          select: {
            isLeader: true,
            team: {
              select: {
                id: true,
                name: true,
                branch: { select: { id: true, nameAr: true } },
                operationalVehicles: { select: { id: true, code: true, plateNumber: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  const branches: ResourceBranchDto[] = branchesRaw.map((branch) => ({
    ...branch,
    teams: branch.teams.map((team) => ({
      id: team.id,
      name: team.name,
      members: team.members.map(({ user }) => user),
    })),
  }));
  const materials: ResourceMaterialDto[] = materialsRaw.map((material) => ({
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
  const services: ServiceMaterialDto[] = servicesRaw.map((service) => ({
    id: service.id,
    nameAr: service.nameAr,
    active: service.active,
    materialRequirements: service.materialRequirements,
  }));
  const stocks: ResourceStockDto[] = stocksRaw.map((stock) => ({
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
      ...movement,
      type: movement.type,
      createdAt: movement.createdAt.toISOString(),
      bookingNumber: movement.booking?.bookingNumber ?? null,
      createdByName: movement.createdBy.fullName,
    })),
  }));
  const employeeStocks = employeeStocksRaw.map((stock) => ({
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
  const employees: OperationsEmployeeDto[] = employeesRaw.map((employee) => ({
    id: employee.id,
    fullName: employee.fullName,
    phone: employee.phone,
    role: employee.role,
    isLeader: Boolean(employee.teamMemberships[0]?.isLeader),
    teamId: employee.teamMemberships[0]?.team.id,
    teamName: employee.teamMemberships[0]?.team.name,
    branchName: employee.teamMemberships[0]?.team.branch.nameAr,
    vehicleLabel: employee.teamMemberships[0]?.team.operationalVehicles[0]
      ? `${employee.teamMemberships[0].team.operationalVehicles[0].code}${employee.teamMemberships[0].team.operationalVehicles[0].plateNumber ? ` (${employee.teamMemberships[0].team.operationalVehicles[0].plateNumber})` : ''}`
      : undefined,
  }));
  const vehicles: ResourceVehicleDto[] = vehiclesRaw.map((vehicle) => ({
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
  const bookings: ResourceBookingDto[] = bookingsRaw.map((booking) => ({
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
    <OperationsResourcesBoard
      actorRole={actor.role}
      canManageCatalog={canManageCatalog}
      branches={branches}
      materials={materials}
      services={services}
      stocks={stocks}
      employeeStocks={employeeStocks}
      employees={employees}
      vehicles={vehicles}
      bookings={bookings}
    />
  );
}

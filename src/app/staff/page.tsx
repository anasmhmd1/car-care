import type { Metadata } from 'next';
import {
  BookingStatus,
  FileType,
  ProofStatus,
  UserRole,
} from '@prisma/client';
import {
  getAccessibleBranchIds,
  sanitizeClientData,
} from '@/lib/auth/authorization';
import {
  bookingPermissionScopes,
  hasPermission,
  hasPermissionAcrossScopes,
  type PermissionCode,
} from '@/lib/auth/permissions';
import { requireRole } from '@/lib/auth/session';
import {
  readMaterialRequirementsSnapshot,
  type BookingMaterialRequirementSnapshot,
} from '@/lib/booking/material-requirements-snapshot';
import { db } from '@/lib/db';
import StaffCommandCenter, {
  type DelegatedQueuesDto,
  type StaffBookingDto,
  type StaffMetricsDto,
  type StaffSection,
} from './StaffCommandCenter';

export const metadata: Metadata = {
  title: 'مركز قيادة التنفيذ الميداني | بريق',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const VALID_SECTIONS = new Set<StaffSection>([
  'overview',
  'tasks',
  'materials',
  'incidents',
  'delegated',
  'history',
]);

const DELEGATED_QUEUE_PERMISSIONS = [
  'payment.review',
  'booking.accept',
  'booking.view_unassigned',
  'quality.review',
  'payment.record_balance',
  'refund.record_proof',
  'booking.close',
] as const satisfies readonly PermissionCode[];

type DelegatedQueuePermission = (typeof DELEGATED_QUEUE_PERMISSIONS)[number];

interface StaffPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function StaffPage({ searchParams }: StaffPageProps) {
  const params = searchParams ? await searchParams : {};
  const rawSection = Array.isArray(params.section) ? params.section[0] : params.section;
  const currentSection: StaffSection =
    typeof rawSection === 'string' && VALID_SECTIONS.has(rawSection as StaffSection)
      ? (rawSection as StaffSection)
      : 'overview';

  const rawTaskId = Array.isArray(params.taskId) ? params.taskId[0] : params.taskId;
  const initialTaskId = typeof rawTaskId === 'string' ? rawTaskId : undefined;

  const rawStatus = Array.isArray(params.status) ? params.status[0] : params.status;
  const statusFilter = typeof rawStatus === 'string' ? rawStatus : undefined;

  const rawQuery = Array.isArray(params.q) ? params.q[0] : params.q;
  const searchQuery = typeof rawQuery === 'string' ? rawQuery : undefined;

  const employee = await requireRole([
    UserRole.EMPLOYEE,
    UserRole.OPERATIONS_MANAGER,
    UserRole.OWNER,
  ]);

  const teamMember = await db.teamMember.findFirst({
    where: { userId: employee.id },
    include: {
      team: {
        include: {
          branch: { select: { id: true, nameAr: true } },
          operationalVehicles: true,
          members: {
            include: {
              user: { select: { id: true, fullName: true, phone: true } },
            },
          },
        },
      },
    },
  });

  const accessibleBranchIds = await getAccessibleBranchIds(employee);

  // Delegated permissions evaluation
  const bookingPermissionCache = new Map<string, Promise<boolean>>();
  const hasBookingPermission = (
    permission: DelegatedQueuePermission,
    booking: { branchId: string; assignedTeamId: string | null },
  ) => {
    const cacheKey = `${permission}:${booking.branchId}:${booking.assignedTeamId ?? ''}`;
    const cached = bookingPermissionCache.get(cacheKey);
    if (cached) return cached;
    const decision = hasPermissionAcrossScopes(
      employee,
      permission,
      bookingPermissionScopes(booking),
    );
    bookingPermissionCache.set(cacheKey, decision);
    return decision;
  };

  const branches = await db.branch.findMany({
    where: accessibleBranchIds === null ? {} : { id: { in: accessibleBranchIds } },
    orderBy: { nameAr: 'asc' },
    select: { id: true, nameAr: true, teams: { select: { id: true } } },
  });

  const permissionEntries = await Promise.all(
    DELEGATED_QUEUE_PERMISSIONS.flatMap((permission) =>
      branches.map(async (branch) => {
        const unassignedAllowed = await hasBookingPermission(permission, {
          branchId: branch.id,
          assignedTeamId: null,
        });
        const teamPermissions =
          permission === 'booking.view_unassigned'
            ? []
            : await Promise.all(
                branch.teams.map(async (team) =>
                  hasBookingPermission(permission, {
                    branchId: branch.id,
                    assignedTeamId: team.id,
                  }),
                ),
              );
        return {
          permission,
          branchId: branch.id,
          allowed: unassignedAllowed || teamPermissions.some(Boolean),
        };
      }),
    ),
  );

  const allowedBranches = Object.fromEntries(
    DELEGATED_QUEUE_PERMISSIONS.map((permission) => [
      permission,
      permissionEntries
        .filter((entry) => entry.permission === permission && entry.allowed)
        .map((entry) => entry.branchId),
    ]),
  ) as Record<DelegatedQueuePermission, string[]>;

  const [canEditGlobalPrices, branchPricePermissions] = await Promise.all([
    hasPermission(employee, 'catalog.price.manage'),
    Promise.all(
      branches.map((branch) =>
        hasPermission(employee, 'catalog.price.manage', { type: 'BRANCH', id: branch.id }),
      ),
    ),
  ]);
  const canManagePrices =
    employee.role !== UserRole.EMPLOYEE &&
    (canEditGlobalPrices || branchPricePermissions.some(Boolean));

  const delegatedEnabled = Object.fromEntries(
    DELEGATED_QUEUE_PERMISSIONS.map((permission) => [
      permission,
      allowedBranches[permission].length > 0,
    ]),
  ) as Record<DelegatedQueuePermission, boolean>;

  const hasDelegatedOperations =
    Object.values(delegatedEnabled).some(Boolean) || canManagePrices;

  const canAccessAssignedTeamTasks = !teamMember
    ? true
    : await hasPermissionAcrossScopes(employee, 'task.execute', [
        { type: 'BRANCH', id: teamMember.team.branchId },
        { type: 'TEAM', id: teamMember.teamId },
      ]);

  // Query team bookings
  const teamBookings =
    teamMember && canAccessAssignedTeamTasks
      ? await db.booking.findMany({
          where: {
            assignedTeamId: teamMember.teamId,
            branchId: teamMember.team.branchId,
            deletedAt: null,
            bookingStatus: { notIn: ['CANCELLED', 'REJECTED', 'EXPIRED'] },
            terminalReopenSourceStatus: null,
          },
          select: {
            id: true,
            branchId: true,
            serviceId: true,
            bookingNumber: true,
            bookingStatus: true,
            startAt: true,
            gateInstructions: true,
            locationUrl: true,
            totalPrice: true,
            depositAmount: true,
            amountPaid: true,
            amountDue: true,
            assignedEmployeeId: true,
            assignedEmployee: { select: { fullName: true } },
            addressSnapshot: true,
            serviceSnapshot: true,
            service: {
              select: {
                nameAr: true,
                checklistTemplates: {
                  orderBy: { stage: 'asc' },
                  select: {
                    id: true,
                    name: true,
                    stage: true,
                    items: {
                      where: { active: true },
                      orderBy: { displayOrder: 'asc' },
                      select: {
                        id: true,
                        labelAr: true,
                        descriptionAr: true,
                        required: true,
                        requiresPhoto: true,
                        requiresNote: true,
                        displayOrder: true,
                      },
                    },
                  },
                },
              },
            },
            vehicle: { select: { make: true, model: true, color: true, plateNumber: true } },
            operationalVehicle: {
              select: { code: true, plateNumber: true, make: true, model: true },
            },
            customer: {
              select: {
                user: { select: { fullName: true, phone: true, whatsapp: true } },
              },
            },
            checklistInstances: {
              select: {
                results: { select: { itemId: true, isChecked: true, note: true } },
              },
            },
            files: {
              select: {
                id: true,
                fileType: true,
                fileUrl: true,
                mimeType: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
            },
            notes: {
              select: {
                id: true,
                note: true,
                isPrivate: true,
                createdAt: true,
                user: { select: { fullName: true } },
              },
              orderBy: { createdAt: 'desc' },
            },
          },
          orderBy: { startAt: 'asc' },
        })
      : [];

  const materialSnapshotByBookingId = new Map(
    teamBookings.map((booking) => [
      booking.id,
      readMaterialRequirementsSnapshot(booking.serviceSnapshot),
    ]),
  );
  const legacyServiceIds = [
    ...new Set(
      teamBookings.flatMap((booking) =>
        materialSnapshotByBookingId.get(booking.id) === null ? [booking.serviceId] : [],
      ),
    ),
  ];
  const legacyMaterialRequirements = legacyServiceIds.length
    ? await db.serviceMaterialRequirement.findMany({
        where: { serviceId: { in: legacyServiceIds } },
        orderBy: [{ serviceId: 'asc' }, { required: 'desc' }, { material: { nameAr: 'asc' } }],
        select: {
          serviceId: true,
          materialId: true,
          quantity: true,
          required: true,
          notes: true,
          material: { select: { nameAr: true, unit: true } },
        },
      })
    : [];
  const legacyMaterialRequirementsByService = new Map<
    string,
    BookingMaterialRequirementSnapshot[]
  >();
  for (const requirement of legacyMaterialRequirements) {
    const current = legacyMaterialRequirementsByService.get(requirement.serviceId) ?? [];
    current.push({
      id: requirement.materialId,
      nameAr: requirement.material.nameAr,
      unit: requirement.material.unit,
      quantity: requirement.quantity,
      required: requirement.required,
      notes: requirement.notes,
    });
    legacyMaterialRequirementsByService.set(requirement.serviceId, current);
  }
  const materialRequirementsForBooking = (booking: (typeof teamBookings)[number]) =>
    materialSnapshotByBookingId.get(booking.id) ??
    legacyMaterialRequirementsByService.get(booking.serviceId) ??
    [];

  const taskBranchIds = [...new Set(teamBookings.map((booking) => booking.branchId))];
  const taskMaterialIds = [
    ...new Set(
      teamBookings.flatMap((booking) =>
        materialRequirementsForBooking(booking).map((requirement) => requirement.id),
      ),
    ),
  ];
  const taskStocks =
    taskBranchIds.length && taskMaterialIds.length
      ? await db.branchMaterialStock.findMany({
          where: {
            branchId: { in: taskBranchIds },
            materialId: { in: taskMaterialIds },
          },
          select: {
            branchId: true,
            materialId: true,
            quantityOnHand: true,
            reservedQuantity: true,
            active: true,
            material: { select: { active: true } },
          },
        })
      : [];
  const stockByBranchMaterial = new Map(
    taskStocks.map((stock) => [`${stock.branchId}:${stock.materialId}`, stock]),
  );

  const teamBookingsWithMaterials = teamBookings.map((booking) => ({
    ...booking,
    requiredMaterials: materialRequirementsForBooking(booking).map((requirement) => {
      const stock = stockByBranchMaterial.get(`${booking.branchId}:${requirement.id}`);
      const availableQuantity = stock
        ? Math.max(0, stock.quantityOnHand - stock.reservedQuantity)
        : 0;
      return {
        requirementId: requirement.id,
        materialId: requirement.id,
        nameAr: requirement.nameAr,
        unit: requirement.unit,
        quantityRequired: requirement.quantity,
        required: requirement.required,
        notes: requirement.notes,
        materialActive: stock?.material.active ?? false,
        stockConfigured: Boolean(stock),
        stockActive: stock?.active ?? false,
        quantityOnHand: stock?.quantityOnHand ?? 0,
        reservedQuantity: stock?.reservedQuantity ?? 0,
        availableQuantity,
        ready:
          !requirement.required ||
          Boolean(
            stock &&
              stock.active &&
              stock.material.active &&
              availableQuantity >= requirement.quantity,
          ),
      };
    }),
  }));

  const accessibleBookings =
    employee.role === UserRole.EMPLOYEE && !teamMember?.isLeader
      ? teamBookingsWithMaterials.filter(
          (b) => !b.assignedEmployeeId || b.assignedEmployeeId === employee.id,
        )
      : teamBookingsWithMaterials;

  // Custody Stock
  const myCustodyStocks = await db.employeeMaterialStock.findMany({
    where: { employeeId: employee.id, active: true },
    include: { material: { select: { id: true, nameAr: true, sku: true, unit: true } } },
    orderBy: { material: { nameAr: 'asc' } },
  });

  // Delegated Data fetching
  let delegatedData: DelegatedQueuesDto | null = null;

  if (hasDelegatedOperations) {
    const [
      pendingProofs,
      reviewBookings,
      unassignedBookings,
      qualityCandidates,
      balanceCandidates,
      closeCandidates,
      refundCasesRaw,
    ] = await Promise.all([
      delegatedEnabled['payment.review']
        ? db.paymentProof.findMany({
            where: {
              status: ProofStatus.UNDER_REVIEW,
              booking: {
                deletedAt: null,
                bookingStatus: BookingStatus.PAYMENT_UNDER_REVIEW,
                branchId: { in: allowedBranches['payment.review'] },
              },
            },
            take: 50,
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              senderName: true,
              senderPhoneOrAccount: true,
              referenceNumber: true,
              amountSubmitted: true,
              transferTimestamp: true,
              proofFileUrl: true,
              paymentMethod: { select: { name: true } },
              booking: {
                select: {
                  id: true,
                  branchId: true,
                  assignedTeamId: true,
                  bookingNumber: true,
                  depositAmount: true,
                  amountPaid: true,
                  amountDue: true,
                  totalPrice: true,
                  branch: { select: { nameAr: true } },
                  service: { select: { nameAr: true } },
                  vehicle: { select: { make: true, model: true } },
                  customer: { select: { user: { select: { fullName: true } } } },
                },
              },
            },
          })
        : Promise.resolve([]),
      delegatedEnabled['booking.accept']
        ? db.booking.findMany({
            where: {
              deletedAt: null,
              bookingStatus: BookingStatus.AWAITING_OPERATIONS_REVIEW,
              branchId: { in: allowedBranches['booking.accept'] },
            },
            take: 50,
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              branchId: true,
              assignedTeamId: true,
              bookingNumber: true,
              startAt: true,
              amountPaid: true,
              amountDue: true,
              branch: { select: { nameAr: true } },
              service: { select: { nameAr: true } },
              vehicle: { select: { make: true, model: true, plateNumber: true } },
              coverageArea: { select: { compound: true } },
              customer: { select: { user: { select: { fullName: true } } } },
            },
          })
        : Promise.resolve([]),
      delegatedEnabled['booking.view_unassigned']
        ? db.booking.findMany({
            where: {
              deletedAt: null,
              assignedTeamId: null,
              bookingStatus: { in: [BookingStatus.ACCEPTED, BookingStatus.AWAITING_ASSIGNMENT] },
              branchId: { in: allowedBranches['booking.view_unassigned'] },
            },
            take: 50,
            orderBy: { startAt: 'asc' },
            select: {
              id: true,
              branchId: true,
              assignedTeamId: true,
              bookingNumber: true,
              bookingStatus: true,
              startAt: true,
              branch: { select: { nameAr: true } },
              service: { select: { nameAr: true } },
              vehicle: { select: { make: true, model: true, plateNumber: true } },
              coverageArea: { select: { compound: true } },
            },
          })
        : Promise.resolve([]),
      delegatedEnabled['quality.review']
        ? db.booking.findMany({
            where: {
              deletedAt: null,
              bookingStatus: BookingStatus.QUALITY_REVIEW,
              branchId: { in: allowedBranches['quality.review'] },
            },
            take: 50,
            orderBy: { startAt: 'asc' },
            select: {
              id: true,
              branchId: true,
              assignedTeamId: true,
              bookingNumber: true,
              branch: { select: { nameAr: true } },
              service: { select: { nameAr: true } },
              assignedTeam: { select: { name: true } },
              customer: { select: { user: { select: { fullName: true } } } },
              files: {
                where: {
                  fileType: {
                    in: [FileType.BEFORE_SERVICE, FileType.AFTER_SERVICE, FileType.EXISTING_DAMAGE],
                  },
                },
                select: { id: true, fileType: true, fileUrl: true, mimeType: true },
              },
            },
          })
        : Promise.resolve([]),
      delegatedEnabled['payment.record_balance']
        ? db.booking.findMany({
            where: {
              deletedAt: null,
              amountDue: { gt: 0 },
              bookingStatus: { in: [BookingStatus.IN_SERVICE, BookingStatus.SERVICE_COMPLETED] },
              branchId: { in: allowedBranches['payment.record_balance'] },
            },
            take: 50,
            orderBy: { startAt: 'asc' },
            select: {
              id: true,
              branchId: true,
              assignedTeamId: true,
              bookingNumber: true,
              bookingStatus: true,
              amountDue: true,
              amountPaid: true,
              totalPrice: true,
              branch: { select: { nameAr: true } },
              service: { select: { nameAr: true } },
              customer: { select: { user: { select: { fullName: true } } } },
            },
          })
        : Promise.resolve([]),
      delegatedEnabled['booking.close']
        ? db.booking.findMany({
            where: {
              deletedAt: null,
              bookingStatus: BookingStatus.DELIVERED,
              branchId: { in: allowedBranches['booking.close'] },
            },
            take: 50,
            orderBy: { startAt: 'asc' },
            select: {
              id: true,
              branchId: true,
              assignedTeamId: true,
              bookingNumber: true,
              branch: { select: { nameAr: true } },
              service: { select: { nameAr: true } },
              customer: { select: { user: { select: { fullName: true } } } },
            },
          })
        : Promise.resolve([]),
      delegatedEnabled['refund.record_proof']
        ? db.cancellationRequest.findMany({
            where: {
              status: 'APPROVED_REFUND_PENDING',
              booking: {
                deletedAt: null,
                branchId: { in: allowedBranches['refund.record_proof'] },
              },
            },
            take: 50,
            orderBy: { updatedAt: 'asc' },
            select: {
              id: true,
              approvedRefundAmount: true,
              booking: {
                select: {
                  id: true,
                  branchId: true,
                  assignedTeamId: true,
                  bookingNumber: true,
                  branch: { select: { nameAr: true } },
                  service: { select: { nameAr: true } },
                  customer: { select: { user: { select: { fullName: true } } } },
                  refunds: {
                    where: { status: { in: ['REFUND_PROCESSING', 'REFUNDED'] } },
                    select: { amount: true },
                  },
                },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    delegatedData = {
      enabled: delegatedEnabled,
      canManagePrices,
      pendingProofs,
      reviewBookings,
      unassignedBookings,
      qualityBookings: qualityCandidates,
      balanceBookings: balanceCandidates,
      closeBookings: closeCandidates,
      refundCases: refundCasesRaw.flatMap((request) => {
        const recordedAmount = request.booking.refunds.reduce(
          (total, refund) => total + refund.amount,
          0,
        );
        const remainingAmount = Math.max(
          0,
          (request.approvedRefundAmount ?? 0) - recordedAmount,
        );
        return remainingAmount > 0
          ? [
              {
                id: request.id,
                approvedRefundAmount: request.approvedRefundAmount ?? 0,
                remainingAmount,
                booking: {
                  id: request.booking.id,
                  bookingNumber: request.booking.bookingNumber,
                  branch: request.booking.branch,
                  service: request.booking.service,
                  customer: request.booking.customer,
                },
              },
            ]
          : [];
      }),
    };
  }

  // Calculate metrics
  const todayTasks = accessibleBookings.length;
  const inProgress = accessibleBookings.filter((b) =>
    ['ON_THE_WAY', 'ARRIVED', 'IN_SERVICE'].includes(b.bookingStatus),
  ).length;
  const pendingAcknowledgment = accessibleBookings.filter(
    (b) => b.bookingStatus === 'ASSIGNED',
  ).length;
  const arrived = accessibleBookings.filter((b) => b.bookingStatus === 'ARRIVED').length;
  const inService = accessibleBookings.filter((b) => b.bookingStatus === 'IN_SERVICE').length;
  const qualityReview = accessibleBookings.filter(
    (b) => b.bookingStatus === 'QUALITY_REVIEW',
  ).length;
  const completedToday = accessibleBookings.filter((b) =>
    ['SERVICE_COMPLETED', 'DELIVERED', 'CLOSED'].includes(b.bookingStatus),
  ).length;

  const bookingsWithMaterials = accessibleBookings.filter((b) => b.requiredMaterials.length > 0);
  const readyBookingsCount = bookingsWithMaterials.filter((b) =>
    b.requiredMaterials.every((m) => !m.required || m.ready),
  ).length;
  const materialsReadinessRate =
    bookingsWithMaterials.length > 0
      ? Math.round((readyBookingsCount / bookingsWithMaterials.length) * 100)
      : 100;

  const delegatedTasksCount = delegatedData
    ? delegatedData.pendingProofs.length +
      delegatedData.reviewBookings.length +
      delegatedData.unassignedBookings.length +
      delegatedData.qualityBookings.length +
      delegatedData.balanceBookings.length +
      delegatedData.refundCases.length +
      delegatedData.closeBookings.length
    : 0;

  const metrics: StaffMetricsDto = {
    todayTasks,
    inProgress,
    pendingAcknowledgment,
    arrived,
    inService,
    qualityReview,
    completedToday,
    materialsReadinessRate,
    custodyItemsCount: myCustodyStocks.length,
    delegatedTasksCount,
  };

  const staffTeamDto = teamMember
    ? {
        id: teamMember.team.id,
        name: teamMember.team.name,
        branchId: teamMember.team.branch.id,
        branchName: teamMember.team.branch.nameAr,
        isLeader: Boolean(teamMember.isLeader),
        members: teamMember.team.members.map((m) => ({
          id: m.user.id,
          fullName: m.user.fullName,
          phone: m.user.phone,
          isLeader: Boolean(m.isLeader),
        })),
        operationalVehicles: teamMember.team.operationalVehicles.map((v) => ({
          id: v.id,
          code: v.code,
          plateNumber: v.plateNumber,
          make: v.make,
          model: v.model,
        })),
      }
    : null;

  return (
    <StaffCommandCenter
      employee={{
        id: employee.id,
        fullName: employee.fullName,
        phone: employee.phone,
        role: employee.role,
      }}
      team={staffTeamDto}
      currentSection={currentSection}
      metrics={metrics}
      bookings={sanitizeClientData(accessibleBookings) as StaffBookingDto[]}
      myCustodyStocks={sanitizeClientData(myCustodyStocks)}
      delegatedData={delegatedData ? sanitizeClientData(delegatedData) : null}
      initialTaskId={initialTaskId}
      filters={{
        status: statusFilter,
        search: searchQuery,
      }}
    />
  );
}

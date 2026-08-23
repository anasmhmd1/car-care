import { UserRole } from '@prisma/client';
import Link from 'next/link';
import { LogOut, ShieldCheck } from 'lucide-react';
import { logoutAction } from '@/app/actions/auth';
import BareeqLogo from '@/components/BareeqLogo';
import {
  getAccessibleBranchIds,
  sanitizeClientData,
  toPublicUser,
} from '@/lib/auth/authorization';
import {
  hasPermissionAcrossScopes,
  type PermissionCode,
} from '@/lib/auth/permissions';
import { requireRole } from '@/lib/auth/session';
import {
  readMaterialRequirementsSnapshot,
  type BookingMaterialRequirementSnapshot,
} from '@/lib/booking/material-requirements-snapshot';
import { db } from '@/lib/db';
import TechnicianTaskClient from './TechnicianTaskClient';

export default async function StaffPage() {
  const employee = await requireRole([
    UserRole.EMPLOYEE,
    UserRole.OPERATIONS_MANAGER,
    UserRole.OWNER,
  ]);
  const teamMember = await db.teamMember.findFirst({
    where: { userId: employee.id },
    include: { team: { include: { operationalVehicles: true } } },
  });
  const accessibleBranchIds = await getAccessibleBranchIds(employee);
  const branchIds = accessibleBranchIds ?? (await db.branch.findMany({
    select: { id: true },
  })).map(({ id }) => id);
  const delegatedCodes = [
    'payment.review',
    'booking.accept',
    'booking.view_unassigned',
    'quality.review',
    'payment.record_balance',
    'refund.record_proof',
    'booking.close',
  ] as const satisfies readonly PermissionCode[];
  const scopedDelegations = await Promise.all(
    delegatedCodes.flatMap((code) => branchIds.map((branchId) =>
      hasPermissionAcrossScopes(employee, code, [
        { type: 'BRANCH', id: branchId },
        ...(teamMember?.team.branchId === branchId
          ? [{ type: 'TEAM' as const, id: teamMember.teamId }]
          : []),
      ]),
    )),
  );
  const hasDelegatedOperations = scopedDelegations.some(Boolean);

  const canAccessAssignedTeamTasks = !teamMember
    ? true
    : await hasPermissionAcrossScopes(employee, 'task.execute', [
        { type: 'BRANCH', id: teamMember.team.branchId },
        { type: 'TEAM', id: teamMember.teamId },
      ]);

  const teamBookings = teamMember && canAccessAssignedTeamTasks
    ? await db.booking.findMany({
        where: {
          assignedTeamId: teamMember.teamId,
          branchId: teamMember.team.branchId,
          deletedAt: null,
          bookingStatus: { notIn: ['CLOSED', 'CANCELLED', 'REJECTED', 'EXPIRED'] },
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
          operationalVehicle: { select: { code: true, plateNumber: true, make: true, model: true } },
          customer: {
            select: {
              user: { select: { fullName: true, phone: true, whatsapp: true } },
            },
          },
          checklistInstances: {
            select: {
              results: { select: { itemId: true, isChecked: true } },
            },
          },
        },
        orderBy: { startAt: 'asc' },
      })
    : [];

  // Bookings created before the snapshot feature deliberately retain the
  // legacy live-service behavior. Newer bookings never load a changed service
  // requirement set here.
  const materialSnapshotByBookingId = new Map(
    teamBookings.map((booking) => [
      booking.id,
      readMaterialRequirementsSnapshot(booking.serviceSnapshot),
    ]),
  );
  const legacyServiceIds = [...new Set(teamBookings.flatMap((booking) =>
    materialSnapshotByBookingId.get(booking.id) === null ? [booking.serviceId] : [],
  ))];
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
  const legacyMaterialRequirementsByService = new Map<string, BookingMaterialRequirementSnapshot[]>();
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
  const materialRequirementsForBooking = (booking: typeof teamBookings[number]) => (
    materialSnapshotByBookingId.get(booking.id)
    ?? legacyMaterialRequirementsByService.get(booking.serviceId)
    ?? []
  );

  const taskBranchIds = [...new Set(teamBookings.map((booking) => booking.branchId))];
  const taskMaterialIds = [...new Set(teamBookings.flatMap((booking) =>
    materialRequirementsForBooking(booking).map((requirement) => requirement.id),
  ))];
  const taskStocks = taskBranchIds.length && taskMaterialIds.length
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
        ready: !requirement.required || Boolean(
          stock
          && stock.active
          && stock.material.active
          && availableQuantity >= requirement.quantity,
        ),
      };
    }),
  }));

  const accessibleBookings = (employee.role === UserRole.EMPLOYEE && !teamMember?.isLeader)
    ? teamBookingsWithMaterials.filter((b) => !b.assignedEmployeeId || b.assignedEmployeeId === employee.id)
    : teamBookingsWithMaterials;

  const myCustodyStocks = await db.employeeMaterialStock.findMany({
    where: { employeeId: employee.id, active: true },
    include: { material: { select: { nameAr: true, sku: true, unit: true } } },
    orderBy: { material: { nameAr: 'asc' } },
  });

  return (
    <div className="min-h-screen bg-[#08080a] text-white selection:bg-[#cea355]/30">
      {/* Subtle Luxury Gradient Background */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(206,163,85,0.08),rgba(255,255,255,0))]" />

      <main className="relative z-10 mx-auto w-full max-w-2xl space-y-6 px-3.5 py-6 sm:px-6 sm:py-8">
        {/* Header Profile Card */}
        <header className="relative overflow-hidden rounded-3xl border border-[#cea355]/30 bg-gradient-to-b from-[#18181c]/95 via-[#111114]/90 to-[#0e0e11]/95 p-5 sm:p-6 shadow-2xl backdrop-blur-md">
          <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-[#cea355]/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-16 -bottom-16 size-48 rounded-full bg-[#cea355]/5 blur-3xl" />

          <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
            <BareeqLogo size="sm" showText />
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-300 transition-all hover:bg-rose-500/20 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>تسجيل الخروج</span>
              </button>
            </form>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-right">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#cea355]/40 bg-[#cea355]/10 px-3 py-0.5 text-[11px] font-bold text-[#f3e4a8]">
                <span className="size-1.5 rounded-full bg-[#cea355] animate-pulse" />
                تطبيق الميدان والتنفيذ
              </span>
              <h1 className="mt-1.5 text-xl sm:text-2xl font-black text-white tracking-tight">
                {employee.fullName}
              </h1>
              <p className="mt-0.5 text-xs text-neutral-400">
                الفريق المسند: <strong className="font-bold text-white">{teamMember?.team.name ?? 'غير مخصص لفريق'}</strong>
              </p>
            </div>

            {hasDelegatedOperations ? (
              <div className="flex shrink-0">
                <Link
                  href="/staff/delegated"
                  className="inline-flex items-center gap-2 rounded-xl border border-[#cea355]/40 bg-[#cea355]/10 px-3.5 py-2 text-xs font-bold text-[#f3e4a8] transition-all hover:bg-[#cea355]/20 hover:border-[#cea355] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#cea355]"
                >
                  <ShieldCheck className="size-4 text-[#cea355]" aria-hidden="true" />
                  <span>المهام المفوّضة</span>
                </Link>
              </div>
            ) : null}
          </div>
        </header>

        {/* Custody Stocks Section */}
        {myCustodyStocks.length > 0 && (
          <section aria-labelledby="custody-title" className="rounded-3xl border border-white/[0.08] bg-[#111114]/90 p-5 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <h2 id="custody-title" className="flex items-center gap-2 text-xs font-black text-[#f3e4a8]">
                <span className="size-2 rounded-full bg-[#cea355]" />
                عهدة المواد الشخصية المتاحة معك
              </h2>
              <span className="text-[11px] font-bold text-neutral-400">
                {myCustodyStocks.length} أصناف
              </span>
            </div>
            <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {myCustodyStocks.map((stock) => (
                <div
                  key={stock.id}
                  className="rounded-2xl border border-white/5 bg-black/40 p-3 text-right transition-all hover:border-[#cea355]/30"
                >
                  <p className="truncate text-xs font-bold text-neutral-200">{stock.material.nameAr}</p>
                  <p className="mt-1.5 text-base font-black tabular-nums text-[#f3e4a8]">
                    {stock.quantityOnHand.toLocaleString('ar-EG', { maximumFractionDigits: 2 })}{' '}
                    <span className="text-[10px] font-medium text-neutral-400">{stock.material.unit}</span>
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <TechnicianTaskClient
          employee={toPublicUser(employee)}
          isLeader={Boolean(teamMember?.isLeader)}
          teamName={teamMember?.team.name ?? null}
          teamVehicles={teamMember?.team.operationalVehicles ?? []}
          myCustodyStocks={myCustodyStocks}
          bookings={sanitizeClientData(accessibleBookings)}
        />
      </main>
    </div>
  );
}

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
    include: { team: true },
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
    <div className="min-h-screen bg-[#080808] text-white">
      <main className="mx-auto w-full max-w-xl space-y-6 px-4 py-8">
        <header className="space-y-4 rounded-3xl border border-[#c9a227]/30 bg-[#141414] p-6 text-center gold-glow">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <BareeqLogo size="sm" showText />
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                تسجيل الخروج
              </button>
            </form>
          </div>
          <p className="text-xs font-bold text-[#e5c45a]">واجهة فريق التنفيذ الميداني</p>
          <h1 className="text-xl font-black">{employee.fullName}</h1>
          <p className="text-xs text-neutral-400">
            الفريق المسند: <strong className="text-white">{teamMember?.team.name ?? 'غير مخصص لفريق'}</strong>
          </p>
          {hasDelegatedOperations ? (
            <nav aria-label="التفويضات الإضافية" className="flex flex-wrap justify-center gap-2 border-t border-neutral-800 pt-4">
              {hasDelegatedOperations ? (
                <Link href="/staff/delegated" className="inline-flex items-center gap-2 rounded-xl border border-[#c9a227]/50 px-3 py-2 text-xs font-bold text-[#e5c45a] hover:bg-[#c9a227]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227]">
                  <ShieldCheck className="size-4" aria-hidden="true" /> المهام المفوّضة
                </Link>
              ) : null}
            </nav>
          ) : null}
        </header>

        {myCustodyStocks.length > 0 && (
          <section aria-labelledby="custody-title" className="rounded-3xl border border-white/10 bg-[#141414] p-5">
            <h2 id="custody-title" className="text-xs font-black text-[#e5c45a]">
              عهدة المواد المتاحة معك
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {myCustodyStocks.map((stock) => (
                <div key={stock.id} className="rounded-xl border border-white/5 bg-black/40 p-2.5 text-right">
                  <p className="truncate text-xs font-bold text-white/80">{stock.material.nameAr}</p>
                  <p className="mt-1 text-sm font-black text-[#f0d36d]">
                    {stock.quantityOnHand.toLocaleString('ar-EG', { maximumFractionDigits: 2 })} <span className="text-[10px] text-white/40">{stock.material.unit}</span>
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <TechnicianTaskClient
          employee={toPublicUser(employee)}
          bookings={sanitizeClientData(accessibleBookings)}
        />
      </main>
    </div>
  );
}

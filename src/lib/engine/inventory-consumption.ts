import { EmployeeMovementType, MaterialMovementType, Prisma } from '@prisma/client';
import { formatMaterialQuantityWithUnit } from '@/lib/inventory/units';

export interface DeductBookingMaterialsInput {
  bookingId: string;
  bookingNumber: string;
  serviceId: string;
  serviceNameAr: string;
  branchId: string;
  assignedEmployeeId: string | null;
  assignedTeamMembers: string[];
  teamLeaderId: string | null;
  teamName?: string | null;
  vehicleCode?: string | null;
  vehiclePlateNumber?: string | null;
  actorUserId: string;
}

/**
 * Deducts configured service material requirements from the assigned team leader / employee's stock
 * and branch stock upon booking completion.
 */
export async function deductEmployeeMaterialsForCompletedBooking(
  tx: Prisma.TransactionClient,
  input: DeductBookingMaterialsInput,
): Promise<void> {
  const requirements = await tx.serviceMaterialRequirement.findMany({
    where: { serviceId: input.serviceId },
    include: { material: true },
  });

  if (requirements.length === 0) return;

  // Determine the employee to deduct custody from (Priority: Team Leader -> Assigned Employee -> First Team Member -> Actor)
  let targetEmployeeId = input.teamLeaderId;
  if (!targetEmployeeId) {
    targetEmployeeId = input.assignedEmployeeId;
  }
  if (!targetEmployeeId && input.assignedTeamMembers.length > 0) {
    targetEmployeeId = input.assignedTeamMembers[0];
  }
  if (!targetEmployeeId) {
    targetEmployeeId = input.actorUserId;
  }

  for (const req of requirements) {
    const qtyToDeduct = Number(req.quantity);
    if (qtyToDeduct <= 0) continue;

    // Ensure idempotency: prevent double deduction for the same booking
    const existingMovement = await tx.employeeInventoryMovement.findFirst({
      where: {
        bookingId: input.bookingId,
        type: EmployeeMovementType.CONSUMPTION_BY_BOOKING,
        employeeStock: { materialId: req.materialId },
      },
    });
    if (existingMovement) continue;

    // Upsert employee stock
    const stock = await tx.employeeMaterialStock.upsert({
      where: {
        employeeId_materialId: {
          employeeId: targetEmployeeId,
          materialId: req.materialId,
        },
      },
      create: {
        employeeId: targetEmployeeId,
        materialId: req.materialId,
        quantityOnHand: -qtyToDeduct,
        active: true,
      },
      update: {
        quantityOnHand: { decrement: qtyToDeduct },
      },
    });

    // Record movement in employee stock history
    const unit = req.material?.unit ?? 'قطعة';
    const matName = req.material?.nameAr ?? '';
    const formattedAmount = formatMaterialQuantityWithUnit(qtyToDeduct, unit);
    await tx.employeeInventoryMovement.create({
      data: {
        employeeStockId: stock.id,
        bookingId: input.bookingId,
        type: EmployeeMovementType.CONSUMPTION_BY_BOOKING,
        quantityChange: -qtyToDeduct,
        balanceAfter: stock.quantityOnHand,
        reason: `خصم استهلاك عهدة لحجز #${input.bookingNumber} (${input.serviceNameAr}${matName ? ` - ${formattedAmount.fullDescription} ${matName}` : ''}${input.vehicleCode ? ` · سيارة ${input.vehicleCode}` : ''}${input.teamName ? ` · فريق ${input.teamName}` : ''})`,
        createdByUserId: input.actorUserId,
      },
    });

    // Also deduct from branch warehouse stock if registered
    const branchStock = await tx.branchMaterialStock.findUnique({
      where: {
        branchId_materialId: {
          branchId: input.branchId,
          materialId: req.materialId,
        },
      },
    });

    if (branchStock) {
      const updatedBranchStock = await tx.branchMaterialStock.update({
        where: { id: branchStock.id },
        data: {
          quantityOnHand: { decrement: qtyToDeduct },
        },
      });

      await tx.inventoryMovement.create({
        data: {
          branchStockId: branchStock.id,
          bookingId: input.bookingId,
          type: MaterialMovementType.CONSUMPTION,
          quantityChange: -qtyToDeduct,
          balanceAfter: updatedBranchStock.quantityOnHand,
          reason: `استهلاك آلي لحجز #${input.bookingNumber} (${formattedAmount.fullDescription} ${matName})`,
          createdByUserId: input.actorUserId,
        },
      });
    }
  }
}

import { EmployeeMovementType, MaterialMovementType, Prisma } from '@prisma/client';

export interface DeductBookingMaterialsInput {
  bookingId: string;
  bookingNumber: string;
  serviceId: string;
  serviceNameAr: string;
  branchId: string;
  assignedEmployeeId: string | null;
  assignedTeamMembers: string[];
  teamLeaderId: string | null;
  actorUserId: string;
}

/**
 * Deducts configured service material requirements from the assigned employee's stock
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

  // Determine the employee to deduct custody from
  let targetEmployeeId = input.assignedEmployeeId;
  if (!targetEmployeeId && input.teamLeaderId) {
    targetEmployeeId = input.teamLeaderId;
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
    await tx.employeeInventoryMovement.create({
      data: {
        employeeStockId: stock.id,
        bookingId: input.bookingId,
        type: EmployeeMovementType.CONSUMPTION_BY_BOOKING,
        quantityChange: -qtyToDeduct,
        balanceAfter: stock.quantityOnHand,
        reason: `خصم استهلاك آلي لحجز #${input.bookingNumber} (${input.serviceNameAr})`,
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
      const integerDeduct = Math.round(qtyToDeduct);
      const updatedBranchStock = await tx.branchMaterialStock.update({
        where: { id: branchStock.id },
        data: {
          quantityOnHand: { decrement: integerDeduct },
        },
      });

      await tx.inventoryMovement.create({
        data: {
          branchStockId: branchStock.id,
          bookingId: input.bookingId,
          type: MaterialMovementType.CONSUMPTION,
          quantityChange: -integerDeduct,
          balanceAfter: updatedBranchStock.quantityOnHand,
          reason: `استهلاك آلي لحجز #${input.bookingNumber}`,
          createdByUserId: input.actorUserId,
        },
      });
    }
  }
}

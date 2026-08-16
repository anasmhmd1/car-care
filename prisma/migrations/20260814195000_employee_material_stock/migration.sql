-- CreateEnum
CREATE TYPE "EmployeeMovementType" AS ENUM ('ALLOCATION', 'CONSUMPTION_BY_BOOKING', 'ADJUSTMENT', 'RETURN');

-- CreateTable
CREATE TABLE "EmployeeMaterialStock" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantityOnHand" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minAlertLevel" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeMaterialStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeInventoryMovement" (
    "id" TEXT NOT NULL,
    "employeeStockId" TEXT NOT NULL,
    "bookingId" TEXT,
    "type" "EmployeeMovementType" NOT NULL,
    "quantityChange" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeInventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeMaterialStock_employeeId_materialId_key" ON "EmployeeMaterialStock"("employeeId", "materialId");

-- CreateIndex
CREATE INDEX "EmployeeMaterialStock_employeeId_active_idx" ON "EmployeeMaterialStock"("employeeId", "active");

-- CreateIndex
CREATE INDEX "EmployeeMaterialStock_materialId_idx" ON "EmployeeMaterialStock"("materialId");

-- CreateIndex
CREATE INDEX "EmployeeInventoryMovement_employeeStockId_createdAt_idx" ON "EmployeeInventoryMovement"("employeeStockId", "createdAt");

-- CreateIndex
CREATE INDEX "EmployeeInventoryMovement_bookingId_idx" ON "EmployeeInventoryMovement"("bookingId");

-- AddForeignKey
ALTER TABLE "EmployeeMaterialStock" ADD CONSTRAINT "EmployeeMaterialStock_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeMaterialStock" ADD CONSTRAINT "EmployeeMaterialStock_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeInventoryMovement" ADD CONSTRAINT "EmployeeInventoryMovement_employeeStockId_fkey" FOREIGN KEY ("employeeStockId") REFERENCES "EmployeeMaterialStock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeInventoryMovement" ADD CONSTRAINT "EmployeeInventoryMovement_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeInventoryMovement" ADD CONSTRAINT "EmployeeInventoryMovement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

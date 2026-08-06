-- Close the remaining operational and customer-facing product scope without
-- changing historic booking/payment records.
CREATE TYPE "OperationalVehicleStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'INACTIVE');
CREATE TYPE "MaterialMovementType" AS ENUM ('RECEIPT', 'ADJUSTMENT', 'CONSUMPTION', 'RETURN', 'WASTE');
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'VOID');
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED');

ALTER TABLE "BrandSettings" ADD COLUMN "homepageContent" JSONB;
ALTER TABLE "Booking"
  ADD COLUMN "assignedEmployeeId" TEXT,
  ADD COLUMN "operationalVehicleId" TEXT;
ALTER TABLE "SubscriptionPlanService" ADD COLUMN "visitQuota" INTEGER;

CREATE TABLE "Material" (
  "id" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "nameAr" TEXT NOT NULL,
  "nameEn" TEXT,
  "unit" TEXT NOT NULL DEFAULT 'قطعة',
  "defaultReorderPoint" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Material_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Material_defaultReorderPoint_nonnegative" CHECK ("defaultReorderPoint" >= 0)
);

CREATE TABLE "ServiceMaterialRequirement" (
  "id" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceMaterialRequirement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServiceMaterialRequirement_quantity_positive" CHECK ("quantity" > 0)
);

CREATE TABLE "BranchMaterialStock" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "quantityOnHand" INTEGER NOT NULL DEFAULT 0,
  "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
  "reorderPoint" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BranchMaterialStock_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BranchMaterialStock_quantities_valid" CHECK (
    "quantityOnHand" >= 0 AND "reservedQuantity" >= 0 AND "reservedQuantity" <= "quantityOnHand"
  ),
  CONSTRAINT "BranchMaterialStock_reorderPoint_nonnegative" CHECK ("reorderPoint" IS NULL OR "reorderPoint" >= 0)
);

CREATE TABLE "OperationalVehicle" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "teamId" TEXT,
  "code" TEXT NOT NULL,
  "plateNumber" TEXT,
  "make" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "year" INTEGER,
  "status" "OperationalVehicleStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperationalVehicle_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OperationalVehicle_year_valid" CHECK ("year" IS NULL OR "year" BETWEEN 1950 AND 2100)
);

CREATE TABLE "InventoryMovement" (
  "id" TEXT NOT NULL,
  "branchStockId" TEXT NOT NULL,
  "bookingId" TEXT,
  "type" "MaterialMovementType" NOT NULL,
  "quantityChange" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "reason" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryMovement_balance_nonnegative" CHECK ("balanceAfter" >= 0),
  CONSTRAINT "InventoryMovement_nonzero_quantity" CHECK ("quantityChange" <> 0)
);

CREATE TABLE "CustomerSubscriptionServiceBalance" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "totalVisits" INTEGER NOT NULL,
  "usedVisits" INTEGER NOT NULL DEFAULT 0,
  "remainingVisits" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerSubscriptionServiceBalance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerSubscriptionServiceBalance_values_valid" CHECK (
    "totalVisits" >= 0 AND "usedVisits" >= 0 AND "remainingVisits" >= 0 AND "usedVisits" + "remainingVisits" = "totalVisits"
  )
);

CREATE TABLE "Invoice" (
  "id" TEXT NOT NULL,
  "invoiceNumber" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "subtotalAmount" INTEGER NOT NULL,
  "paidAmount" INTEGER NOT NULL,
  "dueAmount" INTEGER NOT NULL,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
  "issuedByUserId" TEXT,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Invoice_amounts_nonnegative" CHECK ("subtotalAmount" >= 0 AND "paidAmount" >= 0 AND "dueAmount" >= 0)
);

CREATE TABLE "CustomerServiceRating" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "comment" TEXT,
  "approvedForPublic" BOOLEAN NOT NULL DEFAULT false,
  "approvedByUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerServiceRating_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerServiceRating_score_valid" CHECK ("score" BETWEEN 1 AND 5)
);

CREATE TABLE "SupportTicket" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "bookingId" TEXT,
  "branchId" TEXT,
  "subject" TEXT NOT NULL,
  "category" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
  "assignedToUserId" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportTicketMessage" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "isInternal" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicketMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Material_sku_key" ON "Material"("sku");
CREATE UNIQUE INDEX "ServiceMaterialRequirement_serviceId_materialId_key" ON "ServiceMaterialRequirement"("serviceId", "materialId");
CREATE INDEX "ServiceMaterialRequirement_materialId_idx" ON "ServiceMaterialRequirement"("materialId");
CREATE UNIQUE INDEX "BranchMaterialStock_branchId_materialId_key" ON "BranchMaterialStock"("branchId", "materialId");
CREATE INDEX "BranchMaterialStock_branchId_active_idx" ON "BranchMaterialStock"("branchId", "active");
CREATE UNIQUE INDEX "OperationalVehicle_code_key" ON "OperationalVehicle"("code");
CREATE UNIQUE INDEX "OperationalVehicle_plateNumber_key" ON "OperationalVehicle"("plateNumber");
CREATE INDEX "OperationalVehicle_branchId_status_idx" ON "OperationalVehicle"("branchId", "status");
CREATE INDEX "OperationalVehicle_teamId_status_idx" ON "OperationalVehicle"("teamId", "status");
CREATE INDEX "InventoryMovement_branchStockId_createdAt_idx" ON "InventoryMovement"("branchStockId", "createdAt");
CREATE INDEX "InventoryMovement_bookingId_idx" ON "InventoryMovement"("bookingId");
CREATE UNIQUE INDEX "CustomerSubscriptionServiceBalance_subscriptionId_serviceId_key" ON "CustomerSubscriptionServiceBalance"("subscriptionId", "serviceId");
CREATE INDEX "CustomerSubscriptionServiceBalance_serviceId_remainingVisits_idx" ON "CustomerSubscriptionServiceBalance"("serviceId", "remainingVisits");
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");
CREATE UNIQUE INDEX "Invoice_bookingId_key" ON "Invoice"("bookingId");
CREATE INDEX "Invoice_customerId_issuedAt_idx" ON "Invoice"("customerId", "issuedAt");
CREATE INDEX "Invoice_branchId_issuedAt_idx" ON "Invoice"("branchId", "issuedAt");
CREATE UNIQUE INDEX "CustomerServiceRating_bookingId_key" ON "CustomerServiceRating"("bookingId");
CREATE INDEX "CustomerServiceRating_approvedForPublic_createdAt_idx" ON "CustomerServiceRating"("approvedForPublic", "createdAt");
CREATE INDEX "CustomerServiceRating_customerId_createdAt_idx" ON "CustomerServiceRating"("customerId", "createdAt");
CREATE INDEX "SupportTicket_customerId_status_updatedAt_idx" ON "SupportTicket"("customerId", "status", "updatedAt");
CREATE INDEX "SupportTicket_branchId_status_updatedAt_idx" ON "SupportTicket"("branchId", "status", "updatedAt");
CREATE INDEX "SupportTicket_assignedToUserId_status_idx" ON "SupportTicket"("assignedToUserId", "status");
CREATE INDEX "SupportTicketMessage_ticketId_createdAt_idx" ON "SupportTicketMessage"("ticketId", "createdAt");
CREATE INDEX "Booking_assignedEmployeeId_startAt_idx" ON "Booking"("assignedEmployeeId", "startAt");
CREATE INDEX "Booking_operationalVehicleId_startAt_idx" ON "Booking"("operationalVehicleId", "startAt");

ALTER TABLE "ServiceMaterialRequirement"
  ADD CONSTRAINT "ServiceMaterialRequirement_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ServiceMaterialRequirement_materialId_fkey"
  FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BranchMaterialStock"
  ADD CONSTRAINT "BranchMaterialStock_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "BranchMaterialStock_materialId_fkey"
  FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OperationalVehicle"
  ADD CONSTRAINT "OperationalVehicle_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "OperationalVehicle_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT "InventoryMovement_branchStockId_fkey"
  FOREIGN KEY ("branchStockId") REFERENCES "BranchMaterialStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryMovement_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryMovement_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CustomerSubscriptionServiceBalance"
  ADD CONSTRAINT "CustomerSubscriptionServiceBalance_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "CustomerSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CustomerSubscriptionServiceBalance_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Invoice_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "CustomerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Invoice_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Invoice_issuedByUserId_fkey"
  FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerServiceRating"
  ADD CONSTRAINT "CustomerServiceRating_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CustomerServiceRating_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "CustomerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CustomerServiceRating_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupportTicket"
  ADD CONSTRAINT "SupportTicket_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "CustomerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SupportTicket_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SupportTicket_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SupportTicket_assignedToUserId_fkey"
  FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupportTicketMessage"
  ADD CONSTRAINT "SupportTicketMessage_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SupportTicketMessage_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_assignedEmployeeId_fkey"
  FOREIGN KEY ("assignedEmployeeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Booking_operationalVehicleId_fkey"
  FOREIGN KEY ("operationalVehicleId") REFERENCES "OperationalVehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

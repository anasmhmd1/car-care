-- Required for UUID backfills and PostgreSQL range exclusion constraints.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateEnum
CREATE TYPE "PermissionEffect" AS ENUM ('GRANT', 'DENY');

-- CreateEnum
CREATE TYPE "BookingHoldStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TimeChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "ProofStatus" ADD VALUE 'DUPLICATE_SUSPECTED';

-- DropForeignKey
ALTER TABLE "CancellationRequest" DROP CONSTRAINT "CancellationRequest_bookingId_fkey";

-- DropForeignKey
ALTER TABLE "Complaint" DROP CONSTRAINT "Complaint_bookingId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_bookingId_fkey";

-- DropForeignKey
ALTER TABLE "QualityReview" DROP CONSTRAINT "QualityReview_bookingId_fkey";

-- DropForeignKey
ALTER TABLE "Refund" DROP CONSTRAINT "Refund_bookingId_fkey";

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "deleteReason" TEXT,
ADD COLUMN     "deletedByUserId" TEXT;

-- AlterTable
ALTER TABLE "BookingAssignment" ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "reason" TEXT;

-- AlterTable
ALTER TABLE "BookingHold" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "releasedReason" TEXT,
ADD COLUMN     "slotEndTime" TIMESTAMP(3),
ADD COLUMN     "status" "BookingHoldStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "teamId" TEXT;

-- Backfill legacy holds from their booking and a feasible branch team. Holds
-- without any team cannot reserve capacity and are safely discarded.
UPDATE "BookingHold" AS hold
SET "slotEndTime" = booking."endAt",
    "teamId" = COALESCE(
      booking."assignedTeamId",
      (
        SELECT team."id"
        FROM "Team" AS team
        WHERE team."branchId" = booking."branchId"
          AND team."active" = TRUE
          AND EXISTS (
            SELECT 1 FROM "TeamCapability" AS capability
            WHERE capability."teamId" = team."id"
              AND capability."serviceId" = booking."serviceId"
          )
        ORDER BY team."assignmentPriority" ASC, team."id" ASC
        LIMIT 1
      )
    )
FROM "Booking" AS booking
WHERE booking."id" = hold."bookingId";

DELETE FROM "BookingHold" WHERE "teamId" IS NULL OR "slotEndTime" IS NULL;
UPDATE "BookingHold"
SET "status" = 'EXPIRED',
    "releasedAt" = COALESCE("releasedAt", CURRENT_TIMESTAMP),
    "releasedReason" = COALESCE("releasedReason", 'Expired during integrity migration')
WHERE "expiresAt" <= CURRENT_TIMESTAMP;
ALTER TABLE "BookingHold" ALTER COLUMN "slotEndTime" SET NOT NULL;
ALTER TABLE "BookingHold" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "BrandSettings" ADD COLUMN "singletonKey" TEXT;
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "updatedAt" DESC, "id") AS row_number
  FROM "BrandSettings"
)
UPDATE "BrandSettings" AS settings
SET "singletonKey" = CASE
  WHEN ranked.row_number = 1 THEN 'BAREEQ'
  ELSE 'LEGACY-' || settings."id"
END
FROM ranked
WHERE ranked."id" = settings."id";
ALTER TABLE "BrandSettings" ALTER COLUMN "singletonKey" SET DEFAULT 'BAREEQ';
ALTER TABLE "BrandSettings" ALTER COLUMN "singletonKey" SET NOT NULL;

-- AlterTable
ALTER TABLE "CancellationRequest" ADD COLUMN     "alternativeDates" JSONB,
ADD COLUMN     "approvedRefundAmount" INTEGER,
ADD COLUMN     "customerNotes" TEXT,
ADD COLUMN     "previousBookingStatus" "BookingStatus",
ADD COLUMN     "refundRequired" BOOLEAN,
ADD COLUMN     "responsibleParty" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3);
UPDATE "CancellationRequest" SET "updatedAt" = COALESCE("resolvedAt", "createdAt", CURRENT_TIMESTAMP);
ALTER TABLE "CancellationRequest" ALTER COLUMN "updatedAt" SET NOT NULL;

-- AlterTable
ALTER TABLE "CustomerSubscription" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "frozenAt" TIMESTAMP(3),
ADD COLUMN     "frozenUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PasswordResetRequest" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "proofId" TEXT;
UPDATE "Payment" SET "idempotencyKey" = gen_random_uuid()::text WHERE "idempotencyKey" IS NULL;
ALTER TABLE "Payment" ALTER COLUMN "idempotencyKey" SET NOT NULL;

-- AlterTable
ALTER TABLE "PaymentProof" ADD COLUMN     "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "idempotencyKey" TEXT;
UPDATE "Refund" SET "idempotencyKey" = gen_random_uuid()::text WHERE "idempotencyKey" IS NULL;
ALTER TABLE "Refund" ALTER COLUMN "idempotencyKey" SET NOT NULL;

-- AlterTable
ALTER TABLE "SecurityEvent" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "freezeAllowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxFreezeDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rules" JSONB;

-- AlterTable
ALTER TABLE "SubscriptionVisitLedger" ADD COLUMN     "balanceBefore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "idempotencyKey" TEXT;
UPDATE "SubscriptionVisitLedger" SET "idempotencyKey" = gen_random_uuid()::text WHERE "idempotencyKey" IS NULL;
ALTER TABLE "SubscriptionVisitLedger" ALTER COLUMN "idempotencyKey" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deleteReason" TEXT,
ADD COLUMN     "deletedByUserId" TEXT,
ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "code" "UserRole" NOT NULL,
    "nameAr" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "effect" "PermissionEffect" NOT NULL DEFAULT 'GRANT',
    "scopeType" TEXT NOT NULL DEFAULT 'GLOBAL',
    "scopeId" TEXT NOT NULL DEFAULT 'GLOBAL',
    "grantedByUserId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamWorkingHours" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "isOff" BOOLEAN NOT NULL DEFAULT false,
    "openTime" TEXT NOT NULL,
    "closeTime" TEXT NOT NULL,
    "breakStartTime" TEXT,
    "breakEndTime" TEXT,

    CONSTRAINT "TeamWorkingHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchService" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "bookableOnline" BOOLEAN NOT NULL DEFAULT true,
    "priceOverride" INTEGER,
    "durationOverrideMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "consentType" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingItem" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "sourceId" TEXT,
    "nameSnapshot" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingAssignmentHistory" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "fromTeamId" TEXT,
    "toTeamId" TEXT,
    "changedByUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "scoreLog" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingAssignmentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingTimeChange" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "oldStartAt" TIMESTAMP(3) NOT NULL,
    "oldEndAt" TIMESTAMP(3) NOT NULL,
    "requestedStartAt" TIMESTAMP(3) NOT NULL,
    "requestedEndAt" TIMESTAMP(3) NOT NULL,
    "status" "TimeChangeStatus" NOT NULL DEFAULT 'PENDING',
    "requestedByUserId" TEXT NOT NULL,
    "reviewedByUserId" TEXT,
    "reason" TEXT NOT NULL,
    "reviewNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingTimeChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReview" (
    "id" TEXT NOT NULL,
    "proofId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "reviewedByUserId" TEXT NOT NULL,
    "decision" "ProofStatus" NOT NULL,
    "amountExpected" INTEGER NOT NULL,
    "amountSubmitted" INTEGER NOT NULL,
    "notes" TEXT,
    "previousStatus" "ProofStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlanBranch" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,

    CONSTRAINT "SubscriptionPlanBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "UserPermission_userId_effect_idx" ON "UserPermission"("userId", "effect");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermission_userId_permissionId_scopeType_scopeId_key" ON "UserPermission"("userId", "permissionId", "scopeType", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TeamWorkingHours_teamId_dayOfWeek_key" ON "TeamWorkingHours"("teamId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "BranchService_serviceId_active_idx" ON "BranchService"("serviceId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "BranchService_branchId_serviceId_key" ON "BranchService"("branchId", "serviceId");

-- CreateIndex
CREATE INDEX "CustomerConsent_userId_consentType_acceptedAt_idx" ON "CustomerConsent"("userId", "consentType", "acceptedAt");

-- CreateIndex
CREATE INDEX "BookingItem_bookingId_itemType_idx" ON "BookingItem"("bookingId", "itemType");

-- CreateIndex
CREATE INDEX "BookingAssignmentHistory_bookingId_createdAt_idx" ON "BookingAssignmentHistory"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "BookingTimeChange_bookingId_status_idx" ON "BookingTimeChange"("bookingId", "status");

-- CreateIndex
CREATE INDEX "PaymentReview_bookingId_createdAt_idx" ON "PaymentReview"("bookingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlanBranch_planId_branchId_key" ON "SubscriptionPlanBranch"("planId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_key_key" ON "AppSetting"("key");

-- CreateIndex
CREATE INDEX "BookingFile_bookingId_fileType_idx" ON "BookingFile"("bookingId", "fileType");

-- CreateIndex
CREATE UNIQUE INDEX "BookingFile_fileUrl_key" ON "BookingFile"("fileUrl");

-- CreateIndex
CREATE INDEX "BookingHold_teamId_slotStartTime_slotEndTime_idx" ON "BookingHold"("teamId", "slotStartTime", "slotEndTime");

-- CreateIndex
CREATE INDEX "BookingHold_status_expiresAt_idx" ON "BookingHold"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "BrandSettings_singletonKey_key" ON "BrandSettings"("singletonKey");

-- CreateIndex
CREATE INDEX "CustomerSubscription_customerId_status_idx" ON "CustomerSubscription"("customerId", "status");

-- CreateIndex
CREATE INDEX "CustomerSubscription_status_endDate_idx" ON "CustomerSubscription"("status", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_proofId_key" ON "Payment"("proofId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_bookingId_createdAt_idx" ON "Payment"("bookingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProof_idempotencyKey_key" ON "PaymentProof"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentProof_bookingId_status_idx" ON "PaymentProof"("bookingId", "status");

-- CreateIndex
CREATE INDEX "PaymentProof_referenceNumber_idx" ON "PaymentProof"("referenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_idempotencyKey_key" ON "Refund"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Refund_bookingId_status_idx" ON "Refund"("bookingId", "status");

-- CreateIndex
CREATE INDEX "SecurityEvent_userId_createdAt_idx" ON "SecurityEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_eventType_createdAt_idx" ON "SecurityEvent"("eventType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionVisitLedger_idempotencyKey_key" ON "SubscriptionVisitLedger"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SubscriptionVisitLedger_subscriptionId_createdAt_idx" ON "SubscriptionVisitLedger"("subscriptionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionVisitLedger_subscriptionId_bookingId_action_key" ON "SubscriptionVisitLedger"("subscriptionId", "bookingId", "action");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_userId_key" ON "TeamMember"("userId");

-- Domain integrity checks. Money is stored as integer minor units and all
-- operational intervals are half-open [start, end).
ALTER TABLE "BrandSettings"
  ADD CONSTRAINT "BrandSettings_maxBranches_check" CHECK ("maxBranches" >= 1);
ALTER TABLE "Branch"
  ADD CONSTRAINT "Branch_capacity_check" CHECK (
    "slotUnitMinutes" > 0 AND "arrivalWindowMinutes" >= 0
    AND "travelBufferMinutes" >= 0 AND "dailyBookingLimit" > 0
  );
ALTER TABLE "BranchWorkingHours"
  ADD CONSTRAINT "BranchWorkingHours_day_check" CHECK ("dayOfWeek" BETWEEN 0 AND 6);
ALTER TABLE "TeamWorkingHours"
  ADD CONSTRAINT "TeamWorkingHours_day_check" CHECK ("dayOfWeek" BETWEEN 0 AND 6);
ALTER TABLE "Team"
  ADD CONSTRAINT "Team_capacity_check" CHECK ("dailyCapacity" > 0 AND "assignmentPriority" > 0);
ALTER TABLE "Service"
  ADD CONSTRAINT "Service_values_check" CHECK (
    "basePrice" >= 0 AND "durationMinutes" > 0 AND "slotCount" > 0
    AND "requiredTeamSize" > 0 AND "depositValue" >= 0
    AND "minimumBeforePhotos" >= 0 AND "minimumAfterPhotos" >= 0
  );
ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_time_check" CHECK ("endAt" > "startAt"),
  ADD CONSTRAINT "Booking_money_check" CHECK (
    "basePrice" >= 0 AND "addonPrice" >= 0 AND "totalPrice" >= 0
    AND "depositAmount" >= 0 AND "amountPaid" >= 0 AND "amountDue" >= 0
    AND "totalDurationMinutes" > 0
  );
ALTER TABLE "BookingHold"
  ADD CONSTRAINT "BookingHold_time_check" CHECK (
    "slotEndTime" > "slotStartTime" AND "expiresAt" > "createdAt"
  );
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_amount_check" CHECK ("amount" > 0);
ALTER TABLE "Refund"
  ADD CONSTRAINT "Refund_amount_check" CHECK ("amount" > 0);
ALTER TABLE "CustomerSubscription"
  ADD CONSTRAINT "CustomerSubscription_visits_check" CHECK (
    "totalVisits" >= 0 AND "usedVisits" >= 0 AND "remainingVisits" >= 0
    AND "usedVisits" + "remainingVisits" = "totalVisits" AND "endDate" > "startDate"
  );
ALTER TABLE "SubscriptionVisitLedger"
  ADD CONSTRAINT "SubscriptionVisitLedger_balance_check" CHECK (
    "balanceBefore" >= 0 AND "remainingAfter" >= 0
  );

-- Database-level race protection for the same team. Active holds reserve a
-- candidate team before payment; confirmed assignments reserve it afterwards.
ALTER TABLE "BookingHold"
  ADD CONSTRAINT "BookingHold_team_no_overlap"
  EXCLUDE USING gist (
    "teamId" WITH =,
    tsrange("slotStartTime", "slotEndTime", '[)') WITH &&
  ) WHERE ("status" = 'ACTIVE');

ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_assigned_team_no_overlap"
  EXCLUDE USING gist (
    "assignedTeamId" WITH =,
    tsrange("startAt", "endAt", '[)') WITH &&
  ) WHERE (
    "assignedTeamId" IS NOT NULL
    AND "deletedAt" IS NULL
    AND "bookingStatus" NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED')
  );

-- Audit and security trails are append-only at the database boundary.
CREATE OR REPLACE FUNCTION prevent_immutable_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit and security logs are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_append_only"
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_log_mutation();

CREATE TRIGGER "SecurityEvent_append_only"
BEFORE UPDATE OR DELETE ON "SecurityEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_log_mutation();

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamWorkingHours" ADD CONSTRAINT "TeamWorkingHours_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchService" ADD CONSTRAINT "BranchService_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchService" ADD CONSTRAINT "BranchService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerConsent" ADD CONSTRAINT "CustomerConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingHold" ADD CONSTRAINT "BookingHold_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAssignmentHistory" ADD CONSTRAINT "BookingAssignmentHistory_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAssignmentHistory" ADD CONSTRAINT "BookingAssignmentHistory_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTimeChange" ADD CONSTRAINT "BookingTimeChange_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTimeChange" ADD CONSTRAINT "BookingTimeChange_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTimeChange" ADD CONSTRAINT "BookingTimeChange_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingFile" ADD CONSTRAINT "BookingFile_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReview" ADD CONSTRAINT "PaymentReview_proofId_fkey" FOREIGN KEY ("proofId") REFERENCES "PaymentProof"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReview" ADD CONSTRAINT "PaymentReview_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReview" ADD CONSTRAINT "PaymentReview_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_proofId_fkey" FOREIGN KEY ("proofId") REFERENCES "PaymentProof"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPlanBranch" ADD CONSTRAINT "SubscriptionPlanBranch_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPlanBranch" ADD CONSTRAINT "SubscriptionPlanBranch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationRequest" ADD CONSTRAINT "CancellationRequest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityReview" ADD CONSTRAINT "QualityReview_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

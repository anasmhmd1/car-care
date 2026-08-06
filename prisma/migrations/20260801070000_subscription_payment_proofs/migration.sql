-- Subscription purchases are manually settled and must carry immutable,
-- privately-served proof records before activation.
CREATE TYPE "SubscriptionPaymentProofStatus" AS ENUM (
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'AMOUNT_MISMATCH',
  'REUPLOAD_REQUIRED',
  'DUPLICATE_SUSPECTED'
);

-- Preserve the commercial terms accepted by the customer even if a manager
-- edits the catalog plan while the payment is still under review.
ALTER TABLE "CustomerSubscription" ADD COLUMN "purchasePrice" INTEGER;
UPDATE "CustomerSubscription" AS subscription
SET "purchasePrice" = plan."price"
FROM "SubscriptionPlan" AS plan
WHERE plan."id" = subscription."planId";
ALTER TABLE "CustomerSubscription" ALTER COLUMN "purchasePrice" SET NOT NULL;
ALTER TABLE "CustomerSubscription"
  ADD CONSTRAINT "CustomerSubscription_purchasePrice_nonnegative"
  CHECK ("purchasePrice" >= 0);

CREATE TABLE "SubscriptionPaymentProof" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "paymentMethodId" TEXT NOT NULL,
  "proofFileUrl" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "amountSubmitted" INTEGER NOT NULL,
  "referenceNumber" TEXT,
  "transferTimestamp" TIMESTAMP(3),
  "status" "SubscriptionPaymentProofStatus" NOT NULL DEFAULT 'UNDER_REVIEW',
  "uploadedByUserId" TEXT NOT NULL,
  "reviewedByUserId" TEXT,
  "reviewNotes" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SubscriptionPaymentProof_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubscriptionPaymentProof_amountSubmitted_positive" CHECK ("amountSubmitted" > 0),
  CONSTRAINT "SubscriptionPaymentProof_sizeBytes_positive" CHECK ("sizeBytes" > 0)
);

CREATE UNIQUE INDEX "SubscriptionPaymentProof_proofFileUrl_key"
  ON "SubscriptionPaymentProof"("proofFileUrl");
CREATE INDEX "SubscriptionPaymentProof_subscriptionId_status_createdAt_idx"
  ON "SubscriptionPaymentProof"("subscriptionId", "status", "createdAt");
CREATE INDEX "SubscriptionPaymentProof_paymentMethodId_idx"
  ON "SubscriptionPaymentProof"("paymentMethodId");
CREATE INDEX "SubscriptionPaymentProof_referenceNumber_idx"
  ON "SubscriptionPaymentProof"("referenceNumber");

ALTER TABLE "SubscriptionPaymentProof"
  ADD CONSTRAINT "SubscriptionPaymentProof_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "CustomerSubscription"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SubscriptionPaymentProof"
  ADD CONSTRAINT "SubscriptionPaymentProof_paymentMethodId_fkey"
  FOREIGN KEY ("paymentMethodId") REFERENCES "BranchPaymentMethod"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SubscriptionPaymentProof"
  ADD CONSTRAINT "SubscriptionPaymentProof_uploadedByUserId_fkey"
  FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SubscriptionPaymentProof"
  ADD CONSTRAINT "SubscriptionPaymentProof_reviewedByUserId_fkey"
  FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterEnum
ALTER TYPE "FileType" ADD VALUE 'CANCELLATION_EVIDENCE';

-- AlterTable
ALTER TABLE "CancellationRequest" ADD COLUMN     "attachmentFileId" TEXT;

-- AlterTable
ALTER TABLE "CustomerProfile" ADD COLUMN     "creditBalance" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PaymentProof" ADD COLUMN     "proofFileId" TEXT;

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "proofFileId" TEXT,
ADD COLUMN     "refundTimestamp" TIMESTAMP(3);

-- Link legacy URL snapshots to their private file records when possible.
UPDATE "PaymentProof" AS proof
SET "proofFileId" = file."id"
FROM "BookingFile" AS file
WHERE proof."proofFileId" IS NULL
  AND proof."proofFileUrl" = file."fileUrl"
  AND proof."bookingId" = file."bookingId"
  AND file."fileType" = 'PAYMENT_PROOF';

UPDATE "Refund" AS refund
SET "proofFileId" = file."id"
FROM "BookingFile" AS file
WHERE refund."proofFileId" IS NULL
  AND refund."proofFileUrl" = file."fileUrl"
  AND refund."bookingId" = file."bookingId"
  AND file."fileType" = 'REFUND_PROOF';

-- CreateTable
CREATE TABLE "CustomerCreditTransaction" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "bookingId" TEXT,
    "amount" INTEGER NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "transactionType" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerCreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintEvidence" (
    "id" TEXT NOT NULL,
    "complaintId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerCreditTransaction_idempotencyKey_key" ON "CustomerCreditTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CustomerCreditTransaction_customerId_createdAt_idx" ON "CustomerCreditTransaction"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerCreditTransaction_bookingId_idx" ON "CustomerCreditTransaction"("bookingId");

-- CreateIndex
CREATE INDEX "ComplaintEvidence_fileId_idx" ON "ComplaintEvidence"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintEvidence_complaintId_fileId_key" ON "ComplaintEvidence"("complaintId", "fileId");

-- CreateIndex
CREATE UNIQUE INDEX "CancellationRequest_attachmentFileId_key" ON "CancellationRequest"("attachmentFileId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProof_proofFileId_key" ON "PaymentProof"("proofFileId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_proofFileId_key" ON "Refund"("proofFileId");

-- Financial invariants and immutable customer-credit ledger.
ALTER TABLE "CustomerProfile"
  ADD CONSTRAINT "CustomerProfile_credit_balance_check" CHECK ("creditBalance" >= 0);
ALTER TABLE "CustomerCreditTransaction"
  ADD CONSTRAINT "CustomerCreditTransaction_balance_check" CHECK (
    "amount" <> 0
    AND "balanceBefore" >= 0
    AND "balanceAfter" >= 0
    AND "balanceAfter" = "balanceBefore" + "amount"
  );
ALTER TABLE "CancellationRequest"
  ADD CONSTRAINT "CancellationRequest_refund_amount_check" CHECK (
    "approvedRefundAmount" IS NULL OR "approvedRefundAmount" >= 0
  );

CREATE TRIGGER "CustomerCreditTransaction_append_only"
BEFORE UPDATE OR DELETE ON "CustomerCreditTransaction"
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_log_mutation();

-- AddForeignKey
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_proofFileId_fkey" FOREIGN KEY ("proofFileId") REFERENCES "BookingFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_proofFileId_fkey" FOREIGN KEY ("proofFileId") REFERENCES "BookingFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCreditTransaction" ADD CONSTRAINT "CustomerCreditTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCreditTransaction" ADD CONSTRAINT "CustomerCreditTransaction_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCreditTransaction" ADD CONSTRAINT "CustomerCreditTransaction_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationRequest" ADD CONSTRAINT "CancellationRequest_attachmentFileId_fkey" FOREIGN KEY ("attachmentFileId") REFERENCES "BookingFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintEvidence" ADD CONSTRAINT "ComplaintEvidence_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintEvidence" ADD CONSTRAINT "ComplaintEvidence_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "BookingFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

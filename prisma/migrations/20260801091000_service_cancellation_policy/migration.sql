-- Cancellation policies are reusable catalog entities. Bookings keep an immutable
-- JSON snapshot so later catalog edits never change an accepted booking rule.
CREATE TABLE "CancellationPolicy" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "nameAr" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "noticeHours" INTEGER NOT NULL DEFAULT 6,
  "allowsCancellation" BOOLEAN NOT NULL DEFAULT true,
  "allowsRescheduling" BOOLEAN NOT NULL DEFAULT true,
  "allowsLateRequests" BOOLEAN NOT NULL DEFAULT true,
  "policyTextAr" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CancellationPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CancellationPolicy_noticeHours_check"
    CHECK ("noticeHours" BETWEEN 0 AND 720),
  CONSTRAINT "CancellationPolicy_default_active_check"
    CHECK (NOT "isDefault" OR "active"),
  CONSTRAINT "CancellationPolicy_required_text_check"
    CHECK (
      char_length(btrim("code")) > 0 AND
      char_length(btrim("nameAr")) > 0 AND
      char_length(btrim("version")) > 0 AND
      char_length(btrim("policyTextAr")) > 0
    )
);

CREATE UNIQUE INDEX "CancellationPolicy_code_key"
  ON "CancellationPolicy"("code");
CREATE INDEX "CancellationPolicy_active_isDefault_idx"
  ON "CancellationPolicy"("active", "isDefault");
CREATE UNIQUE INDEX "CancellationPolicy_one_default_key"
  ON "CancellationPolicy"("isDefault")
  WHERE "isDefault" = true;

INSERT INTO "CancellationPolicy" (
  "id",
  "code",
  "nameAr",
  "version",
  "noticeHours",
  "allowsCancellation",
  "allowsRescheduling",
  "allowsLateRequests",
  "policyTextAr",
  "active",
  "isDefault",
  "updatedAt"
) VALUES (
  'system-cancellation-policy-standard',
  'standard-cancellation',
  'سياسة الإلغاء القياسية',
  '2026-08-01',
  6,
  true,
  true,
  true,
  'يمكن للعميل تقديم طلب الإلغاء حتى قبل بدء موعد الخدمة. يُعد الطلب مبكرًا إذا قُدم قبل الموعد بـ 6 ساعات على الأقل. الطلبات داخل هذه المهلة تُوسم كطلبات متأخرة وتخضع لمراجعة التشغيل والتسوية المالية، ولا يعني إرسال الطلب استردادًا تلقائيًا. بعد بدء الخدمة يجب التواصل مع الدعم.',
  true,
  true,
  CURRENT_TIMESTAMP
);

-- Add the service link as nullable, backfill every current row, then enforce it.
ALTER TABLE "Service"
  ADD COLUMN "cancellationPolicyId" TEXT;

UPDATE "Service"
SET "cancellationPolicyId" = 'system-cancellation-policy-standard'
WHERE "cancellationPolicyId" IS NULL;

ALTER TABLE "Service"
  ALTER COLUMN "cancellationPolicyId" SET NOT NULL;

CREATE INDEX "Service_cancellationPolicyId_idx"
  ON "Service"("cancellationPolicyId");

ALTER TABLE "Service"
  ADD CONSTRAINT "Service_cancellationPolicyId_fkey"
  FOREIGN KEY ("cancellationPolicyId")
  REFERENCES "CancellationPolicy"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve both provenance and the accepted values on every booking.
ALTER TABLE "Booking"
  ADD COLUMN "cancellationPolicyId" TEXT,
  ADD COLUMN "cancellationPolicySnapshot" JSONB NOT NULL DEFAULT '{}';

UPDATE "Booking" AS booking
SET
  "cancellationPolicyId" = policy."id",
  "cancellationPolicySnapshot" = jsonb_build_object(
    'policyId', policy."id",
    'code', policy."code",
    'nameAr', policy."nameAr",
    'version', policy."version",
    'noticeHours', policy."noticeHours",
    'allowsCancellation', policy."allowsCancellation",
    'allowsRescheduling', policy."allowsRescheduling",
    'allowsLateRequests', policy."allowsLateRequests",
    'policyTextAr', policy."policyTextAr"
  )
FROM "Service" AS service
JOIN "CancellationPolicy" AS policy
  ON policy."id" = service."cancellationPolicyId"
WHERE booking."serviceId" = service."id";

CREATE INDEX "Booking_cancellationPolicyId_idx"
  ON "Booking"("cancellationPolicyId");

ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_cancellationPolicyId_fkey"
  FOREIGN KEY ("cancellationPolicyId")
  REFERENCES "CancellationPolicy"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

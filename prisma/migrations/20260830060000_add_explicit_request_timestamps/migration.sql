-- Preserve the instant at which customers submitted cancellation/reschedule
-- requests.  `createdAt` is an audit-row timestamp and cannot be reused when
-- a request is reopened or represented by a later status transition.
ALTER TABLE "CancellationRequest"
  ADD COLUMN "requestedAt" TIMESTAMP(3);

UPDATE "CancellationRequest"
SET "requestedAt" = "createdAt"
WHERE "requestedAt" IS NULL;

ALTER TABLE "CancellationRequest"
  ALTER COLUMN "requestedAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "requestedAt" SET NOT NULL;

ALTER TABLE "BookingTimeChange"
  ADD COLUMN "requestedAt" TIMESTAMP(3);

UPDATE "BookingTimeChange"
SET "requestedAt" = "createdAt"
WHERE "requestedAt" IS NULL;

ALTER TABLE "BookingTimeChange"
  ALTER COLUMN "requestedAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "requestedAt" SET NOT NULL;

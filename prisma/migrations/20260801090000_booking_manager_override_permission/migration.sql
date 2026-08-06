-- A dedicated permission keeps checklist/quality override separate from normal
-- booking closure. It is intentionally not employee-delegatable in the runtime
-- registry; Operations Manager remains the only non-owner default holder.
INSERT INTO "Permission" ("id", "code", "nameAr", "description")
VALUES (
  'runtime-permission-booking-override-close',
  'booking.override_close',
  'إغلاق الحجز باستثناء إداري موثق',
  'Close an in-service booking by documented checklist/quality manager override.'
)
ON CONFLICT ("code") DO UPDATE SET
  "nameAr" = EXCLUDED."nameAr",
  "description" = EXCLUDED."description";

-- Keep the persisted baseline role definition aligned for installations that
-- inspect Role.permissions directly. Custom object-shaped configurations are
-- left untouched, while runtime DENY overrides continue to take precedence.
UPDATE "Role"
SET
  "permissions" = "permissions" || '["booking.override_close"]'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'OPERATIONS_MANAGER'
  AND jsonb_typeof("permissions") = 'array'
  AND NOT ("permissions" @> '["booking.override_close"]'::jsonb);

-- A terminal booking reopened for administrative inspection is deliberately
-- review-only. The marker prevents assignment, execution, and capacity
-- blocking until the Owner closes the review back to its original status.
ALTER TABLE "Booking"
  ADD COLUMN "terminalReopenSourceStatus" "BookingStatus",
  ADD COLUMN "terminalReopenedAt" TIMESTAMP(3);

ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_terminal_reopen_review_only_check"
  CHECK (
    ("terminalReopenSourceStatus" IS NULL AND "terminalReopenedAt" IS NULL)
    OR (
      "bookingStatus" = 'ADMIN_REVIEW_REQUIRED'
      AND "terminalReopenSourceStatus" IN ('CLOSED', 'CANCELLED', 'REJECTED', 'EXPIRED')
      AND "terminalReopenedAt" IS NOT NULL
    )
  );

CREATE INDEX "Booking_terminalReopenSourceStatus_idx"
  ON "Booking"("terminalReopenSourceStatus");

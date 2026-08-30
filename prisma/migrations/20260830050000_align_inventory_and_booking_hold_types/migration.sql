-- Keep the database types aligned with the Prisma schema. The original
-- operations migration created inventory quantities as INTEGER, while the
-- application accepts fractional quantities for measured supplies.
ALTER TABLE "ServiceMaterialRequirement"
  ALTER COLUMN "quantity" SET DEFAULT 1,
  ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION
    USING "quantity"::double precision;

ALTER TABLE "BranchMaterialStock"
  ALTER COLUMN "quantityOnHand" SET DEFAULT 0,
  ALTER COLUMN "quantityOnHand" SET DATA TYPE DOUBLE PRECISION
    USING "quantityOnHand"::double precision,
  ALTER COLUMN "reservedQuantity" SET DEFAULT 0,
  ALTER COLUMN "reservedQuantity" SET DATA TYPE DOUBLE PRECISION
    USING "reservedQuantity"::double precision;

ALTER TABLE "InventoryMovement"
  ALTER COLUMN "quantityChange" SET DATA TYPE DOUBLE PRECISION
    USING "quantityChange"::double precision,
  ALTER COLUMN "balanceAfter" SET DATA TYPE DOUBLE PRECISION
    USING "balanceAfter"::double precision;

-- Holds without a feasible team are valid: they reserve the requested slot
-- until assignment is possible. Preserve that contract in the database too.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = '"BookingHold"'::regclass
      AND conname = 'BookingHold_teamId_fkey'
  ) THEN
    ALTER TABLE "BookingHold" DROP CONSTRAINT "BookingHold_teamId_fkey";
  END IF;
END
$$;
ALTER TABLE "BookingHold" ALTER COLUMN "teamId" DROP NOT NULL;
ALTER TABLE "BookingHold"
  ADD CONSTRAINT "BookingHold_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
BEGIN
  IF to_regclass('"CustomerSubscriptionServiceBalance_serviceId_remainingVisits_idx"') IS NOT NULL
     AND to_regclass('"CustomerSubscriptionServiceBalance_serviceId_remainingVisit_idx"') IS NULL THEN
    ALTER INDEX "CustomerSubscriptionServiceBalance_serviceId_remainingVisits_idx"
      RENAME TO "CustomerSubscriptionServiceBalance_serviceId_remainingVisit_idx";
  END IF;
END
$$;

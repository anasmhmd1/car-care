-- Merge accidental duplicate templates into one service/stage template before
-- enforcing the canonical invariant. Items are preserved and remain required.
WITH ranked_templates AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER (
      PARTITION BY "serviceId", "stage"
      ORDER BY "id"
    ) AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY "serviceId", "stage"
      ORDER BY "id"
    ) AS row_number
  FROM "ChecklistTemplate"
)
UPDATE "ChecklistTemplateItem" AS item
SET "templateId" = ranked.keep_id
FROM ranked_templates AS ranked
WHERE item."templateId" = ranked."id"
  AND ranked.row_number > 1;

WITH ranked_templates AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "serviceId", "stage"
      ORDER BY "id"
    ) AS row_number
  FROM "ChecklistTemplate"
)
DELETE FROM "ChecklistTemplate" AS template
USING ranked_templates AS ranked
WHERE template."id" = ranked."id"
  AND ranked.row_number > 1;

-- Consolidate duplicate booking/stage instances. A duplicate group is reset
-- to incomplete so it must pass the live required-item check again.
WITH ranked_instances AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER (
      PARTITION BY "bookingId", "stage"
      ORDER BY "id"
    ) AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY "bookingId", "stage"
      ORDER BY "id"
    ) AS row_number
  FROM "BookingChecklistInstance"
)
UPDATE "BookingChecklistItemResult" AS result
SET "instanceId" = ranked.keep_id
FROM ranked_instances AS ranked
WHERE result."instanceId" = ranked."id"
  AND ranked.row_number > 1;

WITH duplicate_groups AS (
  SELECT "bookingId", "stage", MIN("id") AS keep_id
  FROM "BookingChecklistInstance"
  GROUP BY "bookingId", "stage"
  HAVING COUNT(*) > 1
)
UPDATE "BookingChecklistInstance" AS instance
SET "completedAt" = NULL,
    "completedByUserId" = NULL
FROM duplicate_groups AS duplicate_group
WHERE instance."id" = duplicate_group.keep_id;

WITH ranked_instances AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "bookingId", "stage"
      ORDER BY "id"
    ) AS row_number
  FROM "BookingChecklistInstance"
)
DELETE FROM "BookingChecklistInstance" AS instance
USING ranked_instances AS ranked
WHERE instance."id" = ranked."id"
  AND ranked.row_number > 1;

-- Keep the strongest/latest result when duplicate item rows existed.
WITH ranked_results AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "instanceId", "itemId"
      ORDER BY "isChecked" DESC, "checkedAt" DESC NULLS LAST, "id"
    ) AS row_number
  FROM "BookingChecklistItemResult"
)
DELETE FROM "BookingChecklistItemResult" AS result
USING ranked_results AS ranked
WHERE result."id" = ranked."id"
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX "ChecklistTemplate_serviceId_stage_key"
  ON "ChecklistTemplate"("serviceId", "stage");
CREATE UNIQUE INDEX "BookingChecklistInstance_bookingId_stage_key"
  ON "BookingChecklistInstance"("bookingId", "stage");
CREATE UNIQUE INDEX "BookingChecklistItemResult_instanceId_itemId_key"
  ON "BookingChecklistItemResult"("instanceId", "itemId");

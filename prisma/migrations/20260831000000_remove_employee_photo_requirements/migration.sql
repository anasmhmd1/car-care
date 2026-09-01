-- Employee execution photos are no longer part of the workflow.
-- Existing BookingFile rows remain available for historical/audit access; new
-- employee uploads are rejected by the upload API.

ALTER TABLE "Service"
  DROP CONSTRAINT IF EXISTS "Service_values_check";

ALTER TABLE "Service"
  DROP COLUMN IF EXISTS "minimumBeforePhotos",
  DROP COLUMN IF EXISTS "minimumAfterPhotos";

ALTER TABLE "ChecklistTemplateItem"
  DROP COLUMN IF EXISTS "requiresPhoto";

ALTER TABLE "BookingChecklistItemResult"
  DROP COLUMN IF EXISTS "photoUrl";

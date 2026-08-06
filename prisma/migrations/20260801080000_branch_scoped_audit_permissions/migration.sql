-- Permission records used by the runtime registry. Role defaults remain in code;
-- employee.manage is intentionally not part of the Operations Manager baseline.
INSERT INTO "Permission" ("id", "code", "nameAr", "description")
VALUES
  ('runtime-permission-audit-view', 'audit.view', 'عرض سجل التدقيق حسب نطاق الفرع', 'Branch-scoped audit-log visibility.'),
  ('runtime-permission-employee-manage', 'employee.manage', 'إنشاء وإدارة حسابات Employee بتفويض صريح', 'Explicit permission to create, update, or deactivate Employee accounts.')
ON CONFLICT ("code") DO UPDATE SET
  "nameAr" = EXCLUDED."nameAr",
  "description" = EXCLUDED."description";

ALTER TABLE "AuditLog" ADD COLUMN "branchId" TEXT;
CREATE INDEX "AuditLog_branchId_createdAt_idx" ON "AuditLog"("branchId", "createdAt");

-- Resolve a branch without trusting caller-supplied identifiers. Explicit JSON
-- metadata is accepted only when it references a real Branch; otherwise the
-- branch is derived from the immutable entity relationship.
CREATE OR REPLACE FUNCTION resolve_audit_branch_id(
  audit_entity_type TEXT,
  audit_entity_id TEXT,
  audit_before JSONB,
  audit_after JSONB
)
RETURNS TEXT AS $$
DECLARE
  candidate TEXT;
  resolved TEXT;
BEGIN
  candidate := COALESCE(audit_after ->> 'branchId', audit_before ->> 'branchId');
  IF candidate IS NOT NULL AND EXISTS (SELECT 1 FROM "Branch" WHERE "id" = candidate) THEN
    RETURN candidate;
  END IF;

  candidate := COALESCE(audit_after ->> 'bookingId', audit_before ->> 'bookingId');
  IF candidate IS NOT NULL THEN
    SELECT "branchId" INTO resolved FROM "Booking" WHERE "id" = candidate;
    IF resolved IS NOT NULL THEN RETURN resolved; END IF;
  END IF;

  CASE audit_entity_type
    WHEN 'Branch' THEN
      SELECT "id" INTO resolved FROM "Branch" WHERE "id" = audit_entity_id;
    WHEN 'Booking' THEN
      SELECT "branchId" INTO resolved FROM "Booking" WHERE "id" = audit_entity_id;
    WHEN 'BookingFile' THEN
      SELECT b."branchId" INTO resolved
      FROM "BookingFile" f JOIN "Booking" b ON b."id" = f."bookingId"
      WHERE f."id" = audit_entity_id;
    WHEN 'BookingNote' THEN
      SELECT b."branchId" INTO resolved
      FROM "BookingNote" n JOIN "Booking" b ON b."id" = n."bookingId"
      WHERE n."id" = audit_entity_id;
    WHEN 'BookingChecklistInstance' THEN
      SELECT b."branchId" INTO resolved
      FROM "BookingChecklistInstance" i JOIN "Booking" b ON b."id" = i."bookingId"
      WHERE i."id" = audit_entity_id;
    WHEN 'BookingChecklistItemResult' THEN
      SELECT b."branchId" INTO resolved
      FROM "BookingChecklistItemResult" r
      JOIN "BookingChecklistInstance" i ON i."id" = r."instanceId"
      JOIN "Booking" b ON b."id" = i."bookingId"
      WHERE r."id" = audit_entity_id;
    WHEN 'PaymentProof' THEN
      SELECT b."branchId" INTO resolved
      FROM "PaymentProof" p JOIN "Booking" b ON b."id" = p."bookingId"
      WHERE p."id" = audit_entity_id;
    WHEN 'PaymentReview' THEN
      SELECT b."branchId" INTO resolved
      FROM "PaymentReview" p JOIN "Booking" b ON b."id" = p."bookingId"
      WHERE p."id" = audit_entity_id;
    WHEN 'Payment' THEN
      SELECT b."branchId" INTO resolved
      FROM "Payment" p JOIN "Booking" b ON b."id" = p."bookingId"
      WHERE p."id" = audit_entity_id;
    WHEN 'Refund' THEN
      SELECT b."branchId" INTO resolved
      FROM "Refund" r JOIN "Booking" b ON b."id" = r."bookingId"
      WHERE r."id" = audit_entity_id;
    WHEN 'CancellationRequest' THEN
      SELECT b."branchId" INTO resolved
      FROM "CancellationRequest" c JOIN "Booking" b ON b."id" = c."bookingId"
      WHERE c."id" = audit_entity_id;
    WHEN 'BookingTimeChange' THEN
      SELECT b."branchId" INTO resolved
      FROM "BookingTimeChange" c JOIN "Booking" b ON b."id" = c."bookingId"
      WHERE c."id" = audit_entity_id;
    WHEN 'QualityReview' THEN
      SELECT b."branchId" INTO resolved
      FROM "QualityReview" q JOIN "Booking" b ON b."id" = q."bookingId"
      WHERE q."id" = audit_entity_id;
    WHEN 'Complaint' THEN
      SELECT b."branchId" INTO resolved
      FROM "Complaint" c JOIN "Booking" b ON b."id" = c."bookingId"
      WHERE c."id" = audit_entity_id;
    WHEN 'Team' THEN
      SELECT "branchId" INTO resolved FROM "Team" WHERE "id" = audit_entity_id;
    WHEN 'TeamWorkingHours' THEN
      SELECT t."branchId" INTO resolved
      FROM "TeamWorkingHours" h JOIN "Team" t ON t."id" = h."teamId"
      WHERE h."id" = audit_entity_id;
    WHEN 'TeamTimeOff' THEN
      SELECT t."branchId" INTO resolved
      FROM "TeamTimeOff" o JOIN "Team" t ON t."id" = o."teamId"
      WHERE o."id" = audit_entity_id;
    WHEN 'EmployeeTimeOff' THEN
      SELECT MIN(m."branchId") INTO resolved
      FROM "EmployeeTimeOff" o JOIN "BranchMembership" m ON m."userId" = o."userId"
      WHERE o."id" = audit_entity_id
      HAVING COUNT(DISTINCT m."branchId") = 1;
    WHEN 'CoverageZone' THEN
      SELECT "branchId" INTO resolved FROM "CoverageZone" WHERE "id" = audit_entity_id;
    WHEN 'CoverageArea' THEN
      SELECT z."branchId" INTO resolved
      FROM "CoverageArea" a JOIN "CoverageZone" z ON z."id" = a."zoneId"
      WHERE a."id" = audit_entity_id;
    WHEN 'BranchService' THEN
      SELECT "branchId" INTO resolved FROM "BranchService" WHERE "id" = audit_entity_id;
    WHEN 'BranchPaymentMethod' THEN
      SELECT "branchId" INTO resolved FROM "BranchPaymentMethod" WHERE "id" = audit_entity_id;
    WHEN 'BranchWorkingHours' THEN
      SELECT "branchId" INTO resolved FROM "BranchWorkingHours" WHERE "id" = audit_entity_id;
    WHEN 'BranchBlackoutDate' THEN
      SELECT "branchId" INTO resolved FROM "BranchBlackoutDate" WHERE "id" = audit_entity_id;
    WHEN 'CustomerSubscription' THEN
      SELECT "branchId" INTO resolved FROM "CustomerSubscription" WHERE "id" = audit_entity_id;
    WHEN 'SubscriptionPaymentProof' THEN
      SELECT s."branchId" INTO resolved
      FROM "SubscriptionPaymentProof" p
      JOIN "CustomerSubscription" s ON s."id" = p."subscriptionId"
      WHERE p."id" = audit_entity_id;
    WHEN 'UserPermission' THEN
      SELECT CASE WHEN "scopeType" = 'BRANCH' THEN "scopeId" END INTO resolved
      FROM "UserPermission" WHERE "id" = audit_entity_id;
    WHEN 'User' THEN
      SELECT MIN("branchId") INTO resolved
      FROM "BranchMembership" WHERE "userId" = audit_entity_id
      HAVING COUNT(DISTINCT "branchId") = 1;
    ELSE
      resolved := NULL;
  END CASE;

  IF resolved IS NOT NULL AND EXISTS (SELECT 1 FROM "Branch" WHERE "id" = resolved) THEN
    RETURN resolved;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION set_audit_branch_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."branchId" IS NULL THEN
    NEW."branchId" := resolve_audit_branch_id(
      NEW."entityType",
      NEW."entityId",
      NEW."beforeJson",
      NEW."afterJson"
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_set_branch"
BEFORE INSERT ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION set_audit_branch_id();

-- Backfill existing rows inside this migration, temporarily lifting only the
-- update trigger and restoring it before the transaction commits.
DROP TRIGGER "AuditLog_append_only" ON "AuditLog";
UPDATE "AuditLog"
SET "branchId" = resolve_audit_branch_id(
  "entityType",
  "entityId",
  "beforeJson",
  "afterJson"
)
WHERE "branchId" IS NULL;
CREATE TRIGGER "AuditLog_append_only"
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_log_mutation();

ALTER TABLE "AuditLog"
ADD CONSTRAINT "AuditLog_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

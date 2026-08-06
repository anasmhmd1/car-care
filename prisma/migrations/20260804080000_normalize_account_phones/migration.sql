-- Normalize existing account identities before server actions begin using the
-- canonical digits-only representation. Inputs containing unsupported
-- characters or collapsing onto another account are deliberately retained for
-- manual review rather than merging or disabling an account.
WITH source AS (
  SELECT
    "id",
    regexp_replace(
      translate("phone", '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
      '[[:space:]().-]', '', 'g'
    ) AS compact
  FROM "User"
), international AS (
  SELECT
    "id",
    CASE
      WHEN compact LIKE '+%' THEN substr(compact, 2)
      WHEN compact LIKE '00%' THEN substr(compact, 3)
      ELSE compact
    END AS digits
  FROM source
), normalized AS (
  SELECT
    "id",
    CASE
      WHEN digits ~ '^01[0125][0-9]{8}$' THEN '20' || substr(digits, 2)
      ELSE digits
    END AS canonical_phone
  FROM international
), safe AS (
  SELECT "id", canonical_phone
  FROM normalized
  WHERE canonical_phone ~ '^[1-9][0-9]{9,14}$'
    AND canonical_phone NOT IN (
      SELECT canonical_phone
      FROM normalized
      WHERE canonical_phone ~ '^[1-9][0-9]{9,14}$'
      GROUP BY canonical_phone
      HAVING count(*) > 1
    )
)
UPDATE "User" AS target
SET "phone" = safe.canonical_phone
FROM safe
WHERE target."id" = safe."id"
  AND target."phone" <> safe.canonical_phone;

WITH source AS (
  SELECT
    "id",
    regexp_replace(
      translate("whatsapp", '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
      '[[:space:]().-]', '', 'g'
    ) AS compact
  FROM "User"
  WHERE "whatsapp" IS NOT NULL
), international AS (
  SELECT
    "id",
    CASE
      WHEN compact LIKE '+%' THEN substr(compact, 2)
      WHEN compact LIKE '00%' THEN substr(compact, 3)
      ELSE compact
    END AS digits
  FROM source
), normalized AS (
  SELECT
    "id",
    CASE
      WHEN digits ~ '^01[0125][0-9]{8}$' THEN '20' || substr(digits, 2)
      ELSE digits
    END AS canonical_phone
  FROM international
)
UPDATE "User" AS target
SET "whatsapp" = normalized.canonical_phone
FROM normalized
WHERE target."id" = normalized."id"
  AND normalized.canonical_phone ~ '^[1-9][0-9]{9,14}$'
  AND target."whatsapp" <> normalized.canonical_phone;

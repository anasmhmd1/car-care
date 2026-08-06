-- A team has one explicit home zone used by automatic assignment when it has
-- no neighbouring jobs to infer its current position from.
ALTER TABLE "Team" ADD COLUMN "baseZoneId" TEXT;

-- Existing teams used their coverage zones as an implicit starting point.
-- Preserve that behavior deterministically until an operator chooses the
-- actual depot/home zone in workforce setup.
UPDATE "Team" AS team
SET "baseZoneId" = selected_zone."zoneId"
FROM (
  SELECT DISTINCT ON (team_zone."teamId")
    team_zone."teamId",
    team_zone."zoneId"
  FROM "TeamZone" AS team_zone
  INNER JOIN "CoverageZone" AS zone ON zone."id" = team_zone."zoneId"
  ORDER BY team_zone."teamId", zone."name" ASC, team_zone."zoneId" ASC
) AS selected_zone
WHERE team."id" = selected_zone."teamId";

CREATE INDEX "Team_baseZoneId_idx" ON "Team"("baseZoneId");

ALTER TABLE "Team"
  ADD CONSTRAINT "Team_baseZoneId_fkey"
  FOREIGN KEY ("baseZoneId") REFERENCES "CoverageZone"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

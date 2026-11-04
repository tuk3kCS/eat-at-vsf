BEGIN;

DROP INDEX "Restaurant_deletedAt_isActive_name_idx";
ALTER TABLE "Restaurant" DROP COLUMN "isActive";
CREATE INDEX "Restaurant_deletedAt_name_idx" ON "Restaurant" ("deletedAt", "name");

COMMIT;

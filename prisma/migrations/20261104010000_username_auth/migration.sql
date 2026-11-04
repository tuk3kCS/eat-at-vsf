BEGIN;

ALTER TABLE "User" ADD COLUMN "username" TEXT;

WITH candidates AS (
    SELECT "id", lower(split_part("email", '@', 1)) AS candidate
    FROM "User"
), ranked AS (
    SELECT "id", candidate, count(*) OVER (PARTITION BY candidate) AS occurrences
    FROM candidates
)
UPDATE "User" AS account
SET "username" = CASE
    WHEN ranked.occurrences = 1
      AND ranked.candidate ~ '^[a-z0-9][a-z0-9._-]{0,79}$'
      AND ranked.candidate NOT LIKE 'legacy-%'
      AND ranked.candidate <> 'tungnh33'
    THEN ranked.candidate
    ELSE 'legacy-' || account."id"::text
END
FROM ranked
WHERE account."id" = ranked."id";

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
ALTER TABLE "User" DROP COLUMN "name", DROP COLUMN "email";

COMMIT;

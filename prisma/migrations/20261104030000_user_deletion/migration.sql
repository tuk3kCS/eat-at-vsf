BEGIN;

ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMPTZ(3);
UPDATE "User" SET "deletedAt" = CURRENT_TIMESTAMP, "passwordHash" = '' WHERE NOT "isActive";
DELETE FROM "Session" s USING "User" u WHERE s."userId" = u.id AND u."deletedAt" IS NOT NULL;

UPDATE "Order" o SET status = 'CANCELLED', "cancelledAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
FROM "User" u WHERE o."createdById" = u.id AND o.status = 'OPEN' AND u."deletedAt" IS NOT NULL;
DELETE FROM "OrderItem" i USING "OrderParticipant" p, "Order" o, "User" u
WHERE i."participantId" = p.id AND p."orderId" = o.id AND p."userId" = u.id
  AND o.status = 'OPEN' AND u."deletedAt" IS NOT NULL;
DELETE FROM "OrderParticipant" p USING "Order" o, "User" u
WHERE p."orderId" = o.id AND p."userId" = u.id AND o.status = 'OPEN' AND u."deletedAt" IS NOT NULL;

DROP INDEX "User_role_isActive_idx";
ALTER TABLE "User" DROP COLUMN "isActive";
CREATE INDEX "User_deletedAt_username_idx" ON "User" ("deletedAt", "username");

COMMIT;

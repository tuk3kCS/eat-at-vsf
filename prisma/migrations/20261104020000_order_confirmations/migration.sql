BEGIN;

-- Preserve the closed state of orders that were already closed under the old rules.
UPDATE "Order"
SET "status" = 'CLOSED'
WHERE "status" = 'SUBMITTED'
   OR ("status" = 'OPEN' AND "deadline" <= now());

CREATE TYPE "OrderStatus_new" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');
ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'OPEN';
DROP TYPE "OrderStatus_old";

ALTER TABLE "Order" ALTER COLUMN "title" DROP NOT NULL;
ALTER TABLE "OrderParticipant" ADD COLUMN "confirmedAt" TIMESTAMPTZ(3);

COMMIT;

-- Hard-delete any existing reference edges before removing the enum value
DELETE FROM "Edge" WHERE "type" = 'reference';

/*
  Warnings:

  - The values [reference] on the enum `EdgeType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "EdgeType_new" AS ENUM ('composition', 'dependency');
ALTER TABLE "Edge" ALTER COLUMN "type" TYPE "EdgeType_new" USING ("type"::text::"EdgeType_new");
ALTER TYPE "EdgeType" RENAME TO "EdgeType_old";
ALTER TYPE "EdgeType_new" RENAME TO "EdgeType";
DROP TYPE "public"."EdgeType_old";
COMMIT;

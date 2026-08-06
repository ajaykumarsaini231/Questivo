-- AlterTable
--
-- Empty for every existing row, which is the correct starting state: an empty
-- list means "whatever the site-wide PREMIUM_* switch says", so nobody's access
-- changes when this lands. Grants are made one account at a time from the admin
-- panel afterwards.
ALTER TABLE "User" ADD COLUMN     "entitlements" TEXT[] DEFAULT ARRAY[]::TEXT[];

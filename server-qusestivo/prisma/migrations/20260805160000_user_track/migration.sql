-- AlterTable
--
-- Nullable with no default: a null track means "never chosen", which is a real
-- and different state from any particular track. Every existing user has made
-- their choice in a browser rather than on the account, so they are null here
-- until the client writes through on their next visit — see AudienceProvider.
ALTER TABLE "User" ADD COLUMN     "audienceId" TEXT,
ADD COLUMN     "focusExam" TEXT;

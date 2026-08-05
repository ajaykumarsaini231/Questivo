-- How a question is drawn for a candidate, when the default rule gets it wrong.
--
-- The default rule is "a part with a crop is drawn as its crop", applied by the
-- player itself, and it needs no column: NULL means it. This records the
-- exception — "show the text even though a crop exists", or the reverse — so
-- the fix for a mis-cut figure is an edit rather than deleting the crop path.
--
-- Nullable with no default and no backfill: every existing row keeps the
-- behaviour it has today.
ALTER TABLE "PreviousYearQuestion" ADD COLUMN "renderAs" TEXT;

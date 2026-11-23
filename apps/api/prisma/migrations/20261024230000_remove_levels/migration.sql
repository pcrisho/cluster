-- Areas and positions no longer carry level catalogs or labels.
ALTER TABLE "org_nodes" DROP COLUMN "levelId", DROP COLUMN "levelName";
ALTER TABLE "positions" DROP COLUMN "level";
DROP TABLE "org_levels";
DROP TABLE "position_levels";

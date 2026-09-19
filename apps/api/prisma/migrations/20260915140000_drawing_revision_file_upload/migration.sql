-- AlterTable: drawing_revision gains the same upload-tracking columns as document
ALTER TABLE "drawing_revision"
  ADD COLUMN "upload_status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "original_filename" VARCHAR(255),
  ADD COLUMN "mime_type" VARCHAR(150),
  ADD COLUMN "size_bytes" INTEGER;

-- Existing rows have no bytes behind them (typed fileId or none at all) —
-- ACTIVE only where a fileId already exists, matching what `uploadStatus`
-- means for `document`.
UPDATE "drawing_revision" SET "upload_status" = 'ACTIVE' WHERE "file_id" IS NOT NULL;

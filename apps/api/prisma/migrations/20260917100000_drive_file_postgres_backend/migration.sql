-- CreateTable: the optional Postgres-backed DriveAdapter's own storage.
-- Independent of document/drawing_revision — they only ever hold an opaque
-- fileId string, never a foreign key into this table.
CREATE TABLE "drive_file" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "content" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drive_file_pkey" PRIMARY KEY ("id")
);

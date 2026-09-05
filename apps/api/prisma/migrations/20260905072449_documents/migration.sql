-- CreateTable
CREATE TABLE "document" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "upload_status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "file_id" TEXT,
    "original_filename" VARCHAR(255),
    "mime_type" VARCHAR(150),
    "size_bytes" INTEGER,
    "linked_type" VARCHAR(20),
    "linked_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "archived_at" TIMESTAMPTZ(6),
    "archived_by" UUID,

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_project_id_archived_at_idx" ON "document"("project_id", "archived_at");

-- CreateIndex
CREATE INDEX "document_linked_type_linked_id_idx" ON "document"("linked_type", "linked_id");

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Upload status is constrained to the write flow architecture-discussion
-- §6.5 (decision A5) specifies: created pending, uploaded, marked active —
-- or failed. The same discipline every status column in this system gets.
ALTER TABLE document
  ADD CONSTRAINT document_upload_status_known
  CHECK (upload_status IN ('PENDING', 'ACTIVE', 'FAILED'));

-- linked_type is not a real foreign key (docs/phase-3-plan.md §6), but it is
-- still a closed catalogue, checked the same way every status-shaped column
-- in this system is — a typo here should fail loudly, not sit silently in
-- a document nothing can find by its link.
ALTER TABLE document
  ADD CONSTRAINT document_linked_type_known
  CHECK (linked_type IS NULL OR linked_type IN ('ACTIVITY', 'SITE_VISIT', 'ISSUE', 'SUBMISSION'));

-- The Phase 3 documents permission catalogue (docs/phase-3-plan.md §9), read
-- from PRD §3's own role descriptions rather than guessed — Document
-- Controller's own description already says "document metadata, revisions
-- and controlled records", and Project Manager's says nothing about
-- archiving, matching the narrower grant the table gives them.
INSERT INTO role_permission (role_code, permission, scope)
SELECT 'SYSTEM_ADMINISTRATOR', p, 'GLOBAL' FROM unnest(ARRAY[
  'document:view', 'document:create', 'document:edit', 'document:archive'
]) AS p
ON CONFLICT (role_code, permission) DO NOTHING;

INSERT INTO role_permission (role_code, permission, scope)
SELECT 'DIRECTOR', 'document:view', 'GLOBAL'
ON CONFLICT (role_code, permission) DO NOTHING;

INSERT INTO role_permission (role_code, permission, scope)
SELECT 'PROJECT_MANAGER', p, 'PROJECT' FROM unnest(ARRAY[
  'document:view', 'document:create', 'document:edit'
]) AS p
ON CONFLICT (role_code, permission) DO NOTHING;

INSERT INTO role_permission (role_code, permission, scope)
SELECT 'PLANNING', 'document:view', 'PROJECT'
ON CONFLICT (role_code, permission) DO NOTHING;

INSERT INTO role_permission (role_code, permission, scope)
SELECT 'SUPERVISION', 'document:view', 'PROJECT'
ON CONFLICT (role_code, permission) DO NOTHING;

INSERT INTO role_permission (role_code, permission, scope)
SELECT 'DOCUMENT_CONTROLLER', p, 'PROJECT' FROM unnest(ARRAY[
  'document:view', 'document:create', 'document:edit', 'document:archive'
]) AS p
ON CONFLICT (role_code, permission) DO NOTHING;

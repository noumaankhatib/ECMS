-- CreateTable
CREATE TABLE "drawing" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "number" VARCHAR(100) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "current_revision_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "drawing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drawing_revision" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "drawing_id" UUID NOT NULL,
    "revision_code" VARCHAR(50) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    "file_id" TEXT,
    "notes" TEXT,
    "superseded_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "drawing_revision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "drawing_current_revision_id_key" ON "drawing"("current_revision_id");

-- CreateIndex
CREATE INDEX "drawing_project_id_idx" ON "drawing"("project_id");

-- CreateIndex
CREATE INDEX "drawing_revision_drawing_id_superseded_at_idx" ON "drawing_revision"("drawing_id", "superseded_at");

-- CreateIndex
CREATE UNIQUE INDEX "drawing_revision_drawing_id_revision_code_key" ON "drawing_revision"("drawing_id", "revision_code");

-- AddForeignKey
ALTER TABLE "drawing" ADD CONSTRAINT "drawing_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing" ADD CONSTRAINT "drawing_current_revision_id_fkey" FOREIGN KEY ("current_revision_id") REFERENCES "drawing_revision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing_revision" ADD CONSTRAINT "drawing_revision_drawing_id_fkey" FOREIGN KEY ("drawing_id") REFERENCES "drawing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Status is constrained to the shared approval catalogue in @ecms/contracts,
-- the same discipline every status column in this system gets.
ALTER TABLE drawing_revision
  ADD CONSTRAINT drawing_revision_status_known
  CHECK (status IN (
    'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED',
    'RETURNED_FOR_REVISION'
  ));

-- A drawing number is unique within its project, case-insensitively — the
-- consultancy's own identifier for the drawing, the same treatment
-- Project.code gets across the whole portfolio.
CREATE UNIQUE INDEX uq_drawing_number_per_project
  ON drawing (project_id, lower(number));

-- Exactly one current revision per drawing (docs/phase-3-plan.md §5) —
-- enforced here independently of `Drawing.current_revision_id`, which is a
-- convenience pointer, not the source of truth. The counterpart to the
-- "at most one primary contact" index from step 5, pointed at a different
-- condition.
CREATE UNIQUE INDEX uq_drawing_revision_current
  ON drawing_revision (drawing_id)
  WHERE superseded_at IS NULL;

-- The immutability trigger (docs/phase-3-plan.md §5, architecture-discussion
-- decision A3). Once a revision reaches APPROVED, this refuses every
-- UPDATE except the one that sets superseded_at when a later revision
-- arrives, and refuses every DELETE outright. Enforced here so the rule
-- holds even against a bug, a bad migration, or direct database access —
-- the same reasoning the audit_entry privilege lock uses, applied to a
-- single flag instead of a whole table.
CREATE FUNCTION drawing_revision_protect_approved() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'An approved drawing revision cannot be deleted.';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.drawing_id IS DISTINCT FROM OLD.drawing_id
     OR NEW.revision_code IS DISTINCT FROM OLD.revision_code
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.file_id IS DISTINCT FROM OLD.file_id
     OR NEW.notes IS DISTINCT FROM OLD.notes
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'An approved drawing revision is immutable; only superseded_at may change.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER drawing_revision_immutable
  BEFORE UPDATE OR DELETE ON drawing_revision
  FOR EACH ROW
  WHEN (OLD.status = 'APPROVED')
  EXECUTE FUNCTION drawing_revision_protect_approved();

-- The Phase 3 drawings permission catalogue (docs/phase-3-plan.md §9), read
-- from PRD §3's own role descriptions rather than guessed — Planning Team's
-- own description already says "submissions, drawings AND approvals", and
-- Director's says "dashboards AND approvals".
INSERT INTO role_permission (role_code, permission, scope)
SELECT 'SYSTEM_ADMINISTRATOR', p, 'GLOBAL' FROM unnest(ARRAY[
  'drawing:view', 'drawing:create', 'drawing:approve'
]) AS p
ON CONFLICT (role_code, permission) DO NOTHING;

INSERT INTO role_permission (role_code, permission, scope)
SELECT 'DIRECTOR', p, 'GLOBAL' FROM unnest(ARRAY[
  'drawing:view', 'drawing:approve'
]) AS p
ON CONFLICT (role_code, permission) DO NOTHING;

INSERT INTO role_permission (role_code, permission, scope)
SELECT 'PROJECT_MANAGER', p, 'PROJECT' FROM unnest(ARRAY[
  'drawing:view', 'drawing:create'
]) AS p
ON CONFLICT (role_code, permission) DO NOTHING;

INSERT INTO role_permission (role_code, permission, scope)
SELECT 'PLANNING', p, 'PROJECT' FROM unnest(ARRAY[
  'drawing:view', 'drawing:create'
]) AS p
ON CONFLICT (role_code, permission) DO NOTHING;

INSERT INTO role_permission (role_code, permission, scope)
SELECT 'SUPERVISION', 'drawing:view', 'PROJECT'
ON CONFLICT (role_code, permission) DO NOTHING;

INSERT INTO role_permission (role_code, permission, scope)
SELECT 'DOCUMENT_CONTROLLER', 'drawing:view', 'PROJECT'
ON CONFLICT (role_code, permission) DO NOTHING;

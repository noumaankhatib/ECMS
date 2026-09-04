-- CreateTable
CREATE TABLE "issue" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "observation_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "severity" VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    "priority" VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    "owner_id" UUID,
    "due_date" DATE,
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "closure_notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "issue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "issue_project_id_status_idx" ON "issue"("project_id", "status");

-- CreateIndex
CREATE INDEX "issue_observation_id_idx" ON "issue"("observation_id");

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_observation_id_fkey" FOREIGN KEY ("observation_id") REFERENCES "observation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The fourth state machine in the system (phase-1-plan.md §5a). Status is
-- constrained to the catalogue in @ecms/contracts, the same discipline as
-- project, workstream and submission status: a constraint is per-row and
-- catches what a per-request validation cannot — a bad migration or a
-- hand-run UPDATE.
ALTER TABLE issue
  ADD CONSTRAINT issue_status_known
  CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'));

-- Severity and priority are catalogues too (docs/phase-2-plan.md §5) — data,
-- not a fixed set, but still a set the database itself refuses to violate.
ALTER TABLE issue
  ADD CONSTRAINT issue_severity_known
  CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));

ALTER TABLE issue
  ADD CONSTRAINT issue_priority_known
  CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH'));

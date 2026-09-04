-- Planning: activities, milestones and submissions.
--
-- The first of Phase 2's three modules (docs/phase-2-plan.md). A submission
-- stops at SUBMITTED here — there is no approval step yet, because the PRD
-- defines exactly one approval state machine shared across submissions,
-- drawings and documents, and that module is Phase 3. This migration also
-- seeds the FULL Phase 2 permission catalogue (planning, supervision, issue),
-- the same way step 4 seeded the whole Phase 1 matrix before every module
-- behind it existed — the modules catch up to the data, not the other way
-- round.

-- CreateTable
CREATE TABLE "planning_activity" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "assignee_id" UUID,
    "due_date" DATE,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "planning_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestone" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "target_date" DATE,
    "achieved_date" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "reference" VARCHAR(100) NOT NULL,
    "authority_name" VARCHAR(200) NOT NULL,
    "notes" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "submission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "planning_activity_project_id_archived_at_idx" ON "planning_activity"("project_id", "archived_at");

-- CreateIndex
CREATE INDEX "milestone_project_id_archived_at_idx" ON "milestone"("project_id", "archived_at");

-- CreateIndex
CREATE INDEX "submission_project_id_status_idx" ON "submission"("project_id", "status");

-- AddForeignKey
ALTER TABLE "planning_activity" ADD CONSTRAINT "planning_activity_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone" ADD CONSTRAINT "milestone_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission" ADD CONSTRAINT "submission_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Status is constrained to the catalogue in @ecms/contracts, the same
-- discipline as project and workstream status: a constraint is per-row and
-- catches what a per-request validation cannot — a bad migration or a
-- hand-run UPDATE.
ALTER TABLE submission
  ADD CONSTRAINT submission_status_known
  CHECK (status IN ('DRAFT', 'SUBMITTED', 'WITHDRAWN'));

-- Supports case-insensitive lookup of a submission by the consultancy's own
-- reference, without requiring it to be unique — two different authorities
-- can reasonably be quoted the same internal reference across a large
-- portfolio, unlike a project code.
CREATE INDEX idx_submission_reference_lower ON submission (lower(reference));

-- The Phase 2 permission catalogue (docs/phase-2-plan.md §6), seeded now so
-- that supervision and issues can be built against rows that already exist,
-- exactly as Phase 1's `user:*` and `role:*` permissions existed in the
-- matrix three steps before the module behind them was built.
INSERT INTO role_permission (role_code, permission, scope)
SELECT 'SYSTEM_ADMINISTRATOR', p, 'GLOBAL' FROM unnest(ARRAY[
  'planning:view','planning:create','planning:edit',
  'supervision:view','supervision:create','supervision:edit',
  'issue:view','issue:create','issue:edit','issue:close'
]) AS p
ON CONFLICT (role_code, permission) DO NOTHING;

INSERT INTO role_permission (role_code, permission, scope)
SELECT 'DIRECTOR', p, 'GLOBAL' FROM unnest(ARRAY[
  'planning:view','supervision:view','issue:view'
]) AS p
ON CONFLICT (role_code, permission) DO NOTHING;

-- Project Manager — coordination and progress across whichever modules are
-- running on their own projects (PRD §3), matching the PROJECT scope already
-- used for project:edit.
INSERT INTO role_permission (role_code, permission, scope)
SELECT 'PROJECT_MANAGER', p, 'PROJECT' FROM unnest(ARRAY[
  'planning:view','planning:create','planning:edit',
  'supervision:view','supervision:create','supervision:edit',
  'issue:view','issue:create','issue:edit','issue:close'
]) AS p
ON CONFLICT (role_code, permission) DO NOTHING;

-- Planning Team — "planning activities, submissions, drawings and approvals"
-- (PRD §3). Read-only on the other two modules, so they can see what site
-- work is affecting their planning submissions.
INSERT INTO role_permission (role_code, permission, scope)
SELECT 'PLANNING', p, 'PROJECT' FROM unnest(ARRAY[
  'planning:view','planning:create','planning:edit',
  'supervision:view','issue:view'
]) AS p
ON CONFLICT (role_code, permission) DO NOTHING;

-- Supervision Team — "site visits, observations, instructions and issue
-- closure" (PRD §3). issue:close is what makes closure theirs specifically,
-- not merely issue:edit.
INSERT INTO role_permission (role_code, permission, scope)
SELECT 'SUPERVISION', p, 'PROJECT' FROM unnest(ARRAY[
  'planning:view',
  'supervision:view','supervision:create','supervision:edit',
  'issue:view','issue:create','issue:edit','issue:close'
]) AS p
ON CONFLICT (role_code, permission) DO NOTHING;

-- Document Controller — read-only across the operational modules, the same
-- posture Phase 1 gave them on client and property reference data.
INSERT INTO role_permission (role_code, permission, scope)
SELECT 'DOCUMENT_CONTROLLER', p, 'PROJECT' FROM unnest(ARRAY[
  'planning:view','supervision:view','issue:view'
]) AS p
ON CONFLICT (role_code, permission) DO NOTHING;

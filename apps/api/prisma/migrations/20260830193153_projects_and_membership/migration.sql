-- Projects, membership and workstreams.
--
-- The project is the unit of authorization for the whole system, so this
-- migration is where "view authorized projects" stops being a phrase in the PRD
-- and becomes rows that a query can filter on.
--
-- Three things are enforced here rather than in application code, because
-- application checks are per-request and a constraint is per-row:
--
--   * status and type may only ever hold a value from the catalogue
--   * a project code is unique across the portfolio, case-insensitively
--   * a project has at most one workstream of each kind
--
-- Note there is no archived_at on project. CLOSED is the terminal, read-only
-- state and is itself the historical record; a second independent flag would be
-- two ways to say the same thing and two places to get the filter wrong.

-- CreateTable
CREATE TABLE "project" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "type" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "start_date" DATE,
    "target_end_date" DATE,
    "actual_end_date" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_member" (
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_code" VARCHAR(50) NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by" UUID,

    CONSTRAINT "project_member_pkey" PRIMARY KEY ("project_id","user_id")
);

-- CreateTable
CREATE TABLE "workstream" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "notes" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workstream_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_client_id_idx" ON "project"("client_id");

-- CreateIndex
CREATE INDEX "project_property_id_idx" ON "project"("property_id");

-- CreateIndex
CREATE INDEX "project_status_idx" ON "project"("status");

-- CreateIndex
CREATE INDEX "project_member_user_id_idx" ON "project_member"("user_id");

-- CreateIndex
CREATE INDEX "workstream_project_id_idx" ON "workstream"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "workstream_project_id_type_key" ON "workstream"("project_id", "type");

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workstream" ADD CONSTRAINT "workstream_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Status and type are constrained to the catalogue in @ecms/contracts.
--
-- The application validates these too, but validation is per-request and a
-- constraint is per-row: a bad migration, a hand-run UPDATE or a future code
-- path cannot put a value in here that the state machine has no rule for.
-- Adding a state is one line in each of these two places, which is the price of
-- the guarantee.
ALTER TABLE project
  ADD CONSTRAINT project_status_known
  CHECK (status IN ('DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CLOSED'));

ALTER TABLE project
  ADD CONSTRAINT project_type_known
  CHECK (type IN ('PLANNING', 'SUPERVISION', 'BOTH'));

ALTER TABLE workstream
  ADD CONSTRAINT workstream_status_known
  CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED'));

ALTER TABLE workstream
  ADD CONSTRAINT workstream_type_known
  CHECK (type IN ('PLANNING', 'SUPERVISION'));

-- A member's role on a project must be a real role. There is no foreign key to
-- "role" deliberately: role_code here is a record of what someone DOES on this
-- project, and it must survive unchanged even if the role catalogue is later
-- reorganised — the same reasoning that keeps audit_entry free of foreign keys.
ALTER TABLE project_member
  ADD CONSTRAINT project_member_role_known
  CHECK (role_code IN (
    'SYSTEM_ADMINISTRATOR', 'DIRECTOR', 'PROJECT_MANAGER', 'PLANNING',
    'SUPERVISION', 'DOCUMENT_CONTROLLER', 'CLIENT_STAKEHOLDER'
  ));

-- Project codes are quoted in emails, drawings and invoices. Two projects
-- sharing one, differing only in case, is a filing error waiting to happen.
-- Unlike clients and properties this is not a partial index: projects are never
-- archived, so there is no archived row for it to ignore.
CREATE UNIQUE INDEX uq_project_code ON project (lower(code));

-- Supports case-insensitive name search without a sequential scan.
CREATE INDEX idx_project_name_lower ON project (lower(name));

-- CreateTable
CREATE TABLE "site_visit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "visit_date" DATE NOT NULL,
    "attendees" TEXT,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "site_visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "site_visit_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "category" VARCHAR(100),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instruction" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "site_visit_id" UUID NOT NULL,
    "directive_text" TEXT NOT NULL,
    "assignee_id" UUID,
    "due_date" DATE,
    "actioned_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "instruction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_visit_project_id_idx" ON "site_visit"("project_id");

-- CreateIndex
CREATE INDEX "observation_site_visit_id_idx" ON "observation"("site_visit_id");

-- CreateIndex
CREATE INDEX "instruction_site_visit_id_idx" ON "instruction"("site_visit_id");

-- AddForeignKey
ALTER TABLE "site_visit" ADD CONSTRAINT "site_visit_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observation" ADD CONSTRAINT "observation_site_visit_id_fkey" FOREIGN KEY ("site_visit_id") REFERENCES "site_visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instruction" ADD CONSTRAINT "instruction_site_visit_id_fkey" FOREIGN KEY ("site_visit_id") REFERENCES "site_visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

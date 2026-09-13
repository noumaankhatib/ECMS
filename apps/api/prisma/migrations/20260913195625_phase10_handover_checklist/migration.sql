-- CreateTable
CREATE TABLE "handover_checklist" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "final_inspection_at" TIMESTAMPTZ(6),
    "authority_docs_received_at" TIMESTAMPTZ(6),
    "tests_received_at" TIMESTAMPTZ(6),
    "as_built_received_at" TIMESTAMPTZ(6),
    "warranties_received_at" TIMESTAMPTZ(6),
    "final_report_issued_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "handover_checklist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "handover_checklist_project_id_key" ON "handover_checklist"("project_id");

-- AddForeignKey
ALTER TABLE "handover_checklist" ADD CONSTRAINT "handover_checklist_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

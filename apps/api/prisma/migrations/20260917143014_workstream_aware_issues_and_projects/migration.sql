-- AlterTable
ALTER TABLE "issue" ADD COLUMN     "workstream_type" VARCHAR(20);

-- AlterTable
ALTER TABLE "project" ADD COLUMN     "external_planning_reference" VARCHAR(50);

-- CreateIndex
CREATE INDEX "issue_project_id_workstream_type_idx" ON "issue"("project_id", "workstream_type");

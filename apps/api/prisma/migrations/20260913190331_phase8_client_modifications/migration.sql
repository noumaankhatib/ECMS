-- CreateTable
CREATE TABLE "modification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "request_text" TEXT NOT NULL,
    "impact_area" VARCHAR(20) NOT NULL,
    "cost_impact" TEXT,
    "time_impact" TEXT,
    "drawing_revision_id" UUID,
    "observation_id" UUID,
    "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "modification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "modification_project_id_status_idx" ON "modification"("project_id", "status");

-- CreateIndex
CREATE INDEX "modification_drawing_revision_id_idx" ON "modification"("drawing_revision_id");

-- CreateIndex
CREATE INDEX "modification_observation_id_idx" ON "modification"("observation_id");

-- AddForeignKey
ALTER TABLE "modification" ADD CONSTRAINT "modification_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modification" ADD CONSTRAINT "modification_drawing_revision_id_fkey" FOREIGN KEY ("drawing_revision_id") REFERENCES "drawing_revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modification" ADD CONSTRAINT "modification_observation_id_fkey" FOREIGN KEY ("observation_id") REFERENCES "observation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

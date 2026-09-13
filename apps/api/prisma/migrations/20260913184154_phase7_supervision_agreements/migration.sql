-- CreateTable
CREATE TABLE "supervision_agreement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "visits_allowed" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "renewed_at" TIMESTAMPTZ(6),
    "renewed_from_id" UUID,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "supervision_agreement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supervision_agreement_project_id_idx" ON "supervision_agreement"("project_id");

-- AddForeignKey
ALTER TABLE "supervision_agreement" ADD CONSTRAINT "supervision_agreement_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervision_agreement" ADD CONSTRAINT "supervision_agreement_renewed_from_id_fkey" FOREIGN KEY ("renewed_from_id") REFERENCES "supervision_agreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

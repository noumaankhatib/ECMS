-- CreateTable
CREATE TABLE "proposal_sketch_type" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "proposal_sketch_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID,
    "property_id" UUID,
    "contact_name" VARCHAR(200) NOT NULL,
    "contact_phone" VARCHAR(50),
    "sketch_number" VARCHAR(50) NOT NULL,
    "sketch_type_id" UUID,
    "project_type" VARCHAR(20),
    "approx_area_sqm" DECIMAL(10,2),
    "source" VARCHAR(100),
    "assigned_architect_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'NEW',
    "received_at" DATE,
    "due_at" DATE,
    "notes" TEXT,
    "converted_project_id" UUID,
    "converted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "proposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proposal_sketch_type_code_key" ON "proposal_sketch_type"("code");

-- CreateIndex
CREATE UNIQUE INDEX "proposal_converted_project_id_key" ON "proposal"("converted_project_id");

-- CreateIndex
CREATE INDEX "proposal_status_idx" ON "proposal"("status");

-- CreateIndex
CREATE INDEX "proposal_sketch_number_idx" ON "proposal"("sketch_number");

-- CreateIndex
CREATE INDEX "proposal_client_id_idx" ON "proposal"("client_id");

-- AddForeignKey
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_sketch_type_id_fkey" FOREIGN KEY ("sketch_type_id") REFERENCES "proposal_sketch_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_converted_project_id_fkey" FOREIGN KEY ("converted_project_id") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "required_document" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category" VARCHAR(100) NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "scope" VARCHAR(20) NOT NULL DEFAULT 'ANY',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "required_document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "required_document_category_scope_key" ON "required_document"("category", "scope");

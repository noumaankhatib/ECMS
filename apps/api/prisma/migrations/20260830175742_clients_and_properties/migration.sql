-- CreateTable
CREATE TABLE "client" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "reference" VARCHAR(50),
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "archived_at" TIMESTAMPTZ(6),
    "archived_by" UUID,

    CONSTRAINT "client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "position" VARCHAR(150),
    "email" VARCHAR(320),
    "phone" VARCHAR(50),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "reference" VARCHAR(50),
    "address_line_1" VARCHAR(200),
    "address_line_2" VARCHAR(200),
    "city" VARCHAR(100),
    "postcode" VARCHAR(20),
    "country" VARCHAR(100),
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "archived_at" TIMESTAMPTZ(6),
    "archived_by" UUID,

    CONSTRAINT "property_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_archived_at_idx" ON "client"("archived_at");

-- CreateIndex
CREATE INDEX "client_name_idx" ON "client"("name");

-- CreateIndex
CREATE INDEX "contact_client_id_archived_at_idx" ON "contact"("client_id", "archived_at");

-- CreateIndex
CREATE INDEX "property_client_id_archived_at_idx" ON "property"("client_id", "archived_at");

-- CreateIndex
CREATE INDEX "property_archived_at_idx" ON "property"("archived_at");

-- AddForeignKey
ALTER TABLE "contact" ADD CONSTRAINT "contact_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property" ADD CONSTRAINT "property_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

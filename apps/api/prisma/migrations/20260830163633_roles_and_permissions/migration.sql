-- CreateTable
CREATE TABLE "role" (
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role_code" VARCHAR(50) NOT NULL,
    "permission" VARCHAR(100) NOT NULL,
    "scope" VARCHAR(20) NOT NULL,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_role" (
    "user_id" UUID NOT NULL,
    "role_code" VARCHAR(50) NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by" UUID,

    CONSTRAINT "user_role_pkey" PRIMARY KEY ("user_id","role_code")
);

-- CreateIndex
CREATE INDEX "role_permission_role_code_idx" ON "role_permission"("role_code");

-- CreateIndex
CREATE UNIQUE INDEX "role_permission_role_code_permission_key" ON "role_permission"("role_code", "permission");

-- CreateIndex
CREATE INDEX "user_role_role_code_idx" ON "user_role"("role_code");

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_code_fkey" FOREIGN KEY ("role_code") REFERENCES "role"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_role_code_fkey" FOREIGN KEY ("role_code") REFERENCES "role"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

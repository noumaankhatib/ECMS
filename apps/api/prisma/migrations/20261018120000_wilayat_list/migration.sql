-- The wilayats offered on the property form, so a place is always spelled the
-- same way. Seeded from the wilayats already on file (a fresh database starts
-- empty and an administrator adds them), so no existing property is left
-- pointing at a name the list does not know.

CREATE TABLE "wilayat" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "wilayat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wilayat_name_key" ON "wilayat"("name");

INSERT INTO wilayat (name)
SELECT DISTINCT btrim(wilayat) FROM property
WHERE wilayat IS NOT NULL AND btrim(wilayat) <> ''
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permission (role_code, permission, scope)
SELECT r, 'wilayat:admin', 'GLOBAL' FROM unnest(ARRAY[
  'SYSTEM_ADMINISTRATOR','PROJECT_MANAGER'
]) AS r
ON CONFLICT (role_code, permission) DO NOTHING;

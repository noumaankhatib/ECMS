-- CreateTable
CREATE TABLE "audit_entry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" UUID NOT NULL,
    "project_id" UUID,
    "before" JSONB,
    "after" JSONB,
    "outcome" VARCHAR(20) NOT NULL,

    CONSTRAINT "audit_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_entry_entity_type_entity_id_idx" ON "audit_entry"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_entry_project_id_occurred_at_idx" ON "audit_entry"("project_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_entry_actor_user_id_occurred_at_idx" ON "audit_entry"("actor_user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_entry_request_id_idx" ON "audit_entry"("request_id");

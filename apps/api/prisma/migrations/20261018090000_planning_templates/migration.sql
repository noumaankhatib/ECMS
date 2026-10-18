-- Standard planning activities and milestones, offered on the Planning page.
-- Reference data seeded from the names already in use, so the checklist is
-- useful on day one. An administrator edits it afterwards without a code change.

CREATE TABLE "planning_template_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" VARCHAR(20) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "planning_template_item_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "planning_template_item_kind_known" CHECK ("kind" IN ('ACTIVITY', 'MILESTONE'))
);

CREATE UNIQUE INDEX "planning_template_item_kind_name_key" ON "planning_template_item"("kind", "name");

INSERT INTO planning_template_item (kind, name, sort_order) VALUES
  ('ACTIVITY', 'Site survey', 1),
  ('ACTIVITY', 'Soil test coordination', 2),
  ('ACTIVITY', 'Concept layout', 3),
  ('ACTIVITY', 'Client presentation', 4),
  ('ACTIVITY', 'Architectural drawings', 5),
  ('ACTIVITY', 'Structural design', 6),
  ('ACTIVITY', 'MEP design', 7),
  ('ACTIVITY', 'BOQ preparation', 8),
  ('ACTIVITY', 'Municipality submission pack', 9),
  ('ACTIVITY', 'Final drawing set', 10),
  ('MILESTONE', 'Concept approved', 1),
  ('MILESTONE', 'Client approval', 2),
  ('MILESTONE', 'Authority submission', 3),
  ('MILESTONE', 'Permit received', 4),
  ('MILESTONE', 'Planning complete', 5)
ON CONFLICT (kind, name) DO NOTHING;

-- Managing the list. Seeing it is bundled into `planning:view`, the same
-- reasoning `sketch_type:admin` gives for sketch types.
INSERT INTO role_permission (role_code, permission, scope)
SELECT r, 'work_template:admin', 'GLOBAL' FROM unnest(ARRAY[
  'SYSTEM_ADMINISTRATOR','PROJECT_MANAGER'
]) AS r
ON CONFLICT (role_code, permission) DO NOTHING;

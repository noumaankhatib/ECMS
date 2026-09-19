-- Username becomes the mandatory login identity; email becomes optional.
--
-- This system sends no mail of any kind (no welcome mail, no password
-- reset) — email has only ever been a login identity here, never a
-- functioning mailbox, so making it optional carries no deliverability
-- consequence. Every existing account is backfilled a username derived
-- from its email's local part, so nobody already registered loses the
-- ability to sign in; going forward, login accepts either.

-- AlterTable
ALTER TABLE "user" ADD COLUMN "username" VARCHAR(50);

-- Backfill: one username per existing row, derived from the email local
-- part, deduplicated with a numeric suffix on collision.
DO $$
DECLARE
  rec RECORD;
  base_username TEXT;
  candidate TEXT;
  suffix INT;
BEGIN
  FOR rec IN SELECT id, email FROM "user" ORDER BY created_at LOOP
    -- Truncated to 46 chars up front (before any suffix is appended), so
    -- every intermediate value already fits well inside the column's
    -- eventual VARCHAR(50) limit.
    base_username := left(lower(split_part(rec.email, '@', 1)), 46);
    base_username := regexp_replace(base_username, '[^a-z0-9._-]', '.', 'g');
    IF base_username IS NULL OR base_username = '' THEN
      base_username := 'user';
    END IF;

    candidate := base_username;
    suffix := 1;
    WHILE EXISTS (SELECT 1 FROM "user" WHERE username = candidate) LOOP
      suffix := suffix + 1;
      candidate := base_username || suffix::text;
    END LOOP;

    UPDATE "user" SET username = candidate WHERE id = rec.id;
  END LOOP;
END $$;

-- AlterTable
ALTER TABLE "user" ALTER COLUMN "username" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- AlterTable
ALTER TABLE "user" ALTER COLUMN "email" DROP NOT NULL;

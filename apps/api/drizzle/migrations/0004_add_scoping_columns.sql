-- Add project_id to thoughts (roots reference themselves)
ALTER TABLE "thoughts" ADD COLUMN "project_id" uuid;
CREATE INDEX "idx_thoughts_project_id" ON "thoughts" ("project_id");

-- Add user_id to chunks
ALTER TABLE "chunks" ADD COLUMN "user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE;
CREATE INDEX "idx_chunks_user_id" ON "chunks" ("user_id");

-- Add user_id to thought_labels
ALTER TABLE "thought_labels" ADD COLUMN "user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE;
CREATE INDEX "idx_thought_labels_user_id" ON "thought_labels" ("user_id");

-- Backfill: root thoughts get project_id = their own id
UPDATE "thoughts" SET "project_id" = "id" WHERE "is_root" = true;

-- Backfill: walk children iteratively (repeat until no more updates)
-- Pass 1-10 covers trees up to 10 levels deep
DO $$
DECLARE
  rows_updated INT;
BEGIN
  FOR i IN 1..10 LOOP
    UPDATE "thoughts" t
    SET "project_id" = p."project_id"
    FROM "thoughts" p
    WHERE t."parent_id" = p."id"
      AND t."project_id" IS NULL
      AND p."project_id" IS NOT NULL;
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
  END LOOP;
END $$;

-- Backfill: chunks get user_id from their thought
UPDATE "chunks" c
SET "user_id" = t."user_id"
FROM "thoughts" t
WHERE c."thought_id" = t."id"
  AND c."user_id" IS NULL;

-- Backfill: thought_labels get user_id from their thought
UPDATE "thought_labels" tl
SET "user_id" = t."user_id"
FROM "thoughts" t
WHERE tl."thought_id" = t."id"
  AND tl."user_id" IS NULL;

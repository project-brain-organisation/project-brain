ALTER TABLE "labels" ADD COLUMN "project_id" uuid REFERENCES "thoughts"("id") ON DELETE CASCADE;
CREATE INDEX "idx_labels_project_id" ON "labels" ("project_id");

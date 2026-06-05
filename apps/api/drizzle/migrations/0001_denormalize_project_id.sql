ALTER TABLE "thoughts" ADD COLUMN "project_id" uuid;--> statement-breakpoint
UPDATE "thoughts" SET "project_id" = e."project_id" FROM "entities" e WHERE "thoughts"."id" = e."id";--> statement-breakpoint
ALTER TABLE "thoughts" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "thoughts" ADD CONSTRAINT "thoughts_project_id_entities_id_fk" FOREIGN KEY ("project_id") REFERENCES "entities"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE INDEX "idx_thoughts_project_id" ON "thoughts" ("project_id");--> statement-breakpoint
ALTER TABLE "labels" ADD COLUMN "project_id" uuid;--> statement-breakpoint
UPDATE "labels" SET "project_id" = e."project_id" FROM "entities" e WHERE "labels"."id" = e."id";--> statement-breakpoint
ALTER TABLE "labels" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_project_id_entities_id_fk" FOREIGN KEY ("project_id") REFERENCES "entities"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE INDEX "idx_labels_project_id" ON "labels" ("project_id");

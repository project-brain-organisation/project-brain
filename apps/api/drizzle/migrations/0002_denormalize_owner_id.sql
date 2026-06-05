ALTER TABLE "thoughts" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
UPDATE "thoughts" SET "owner_id" = pm."owner_id" FROM "project_meta" pm WHERE "thoughts"."project_id" = pm."id";--> statement-breakpoint
ALTER TABLE "thoughts" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "thoughts" ADD CONSTRAINT "thoughts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX "idx_thoughts_owner_id" ON "thoughts" ("owner_id");--> statement-breakpoint
ALTER TABLE "labels" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
UPDATE "labels" SET "owner_id" = pm."owner_id" FROM "project_meta" pm WHERE "labels"."project_id" = pm."id";--> statement-breakpoint
ALTER TABLE "labels" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX "idx_labels_owner_id" ON "labels" ("owner_id");--> statement-breakpoint
ALTER TABLE "relationships" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
UPDATE "relationships" SET "owner_id" = pm."owner_id" FROM "project_meta" pm WHERE "relationships"."project_id" = pm."id";--> statement-breakpoint
ALTER TABLE "relationships" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX "idx_relationships_owner_id" ON "relationships" ("owner_id");--> statement-breakpoint
ALTER TABLE "chunks" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
UPDATE "chunks" SET "owner_id" = pm."owner_id" FROM "project_meta" pm WHERE "chunks"."project_id" = pm."id";--> statement-breakpoint
ALTER TABLE "chunks" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX "idx_chunks_owner_id" ON "chunks" ("owner_id");

-- 0007_public_graphs.sql — subscriptions table + public-read RLS on content tables
-- NOTE: like 0001–0006, applied manually (drizzle journal only tracks 0000).

CREATE TABLE "project_subscriptions" (
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_subscriptions_user_id_project_id_pk" PRIMARY KEY("user_id","project_id")
);--> statement-breakpoint
ALTER TABLE "project_subscriptions" ADD CONSTRAINT "project_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_subscriptions" ADD CONSTRAINT "project_subscriptions_project_id_entities_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_project_subscriptions_project_id" ON "project_subscriptions" ("project_id");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "project_subscriptions" TO app_user;--> statement-breakpoint
ALTER TABLE "project_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "project_subscriptions_user_isolation" ON "project_subscriptions" AS PERMISSIVE FOR ALL TO "app_user" USING ("user_id" = current_setting('app.current_user_id', true)::uuid) WITH CHECK ("user_id" = current_setting('app.current_user_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "thoughts_public_read" ON "thoughts" AS PERMISSIVE FOR SELECT TO "app_user" USING (exists (select 1 from project_meta where project_meta.id = "thoughts"."project_id" and project_meta.is_public = true));--> statement-breakpoint
CREATE POLICY "labels_public_read" ON "labels" AS PERMISSIVE FOR SELECT TO "app_user" USING (exists (select 1 from project_meta where project_meta.id = "labels"."project_id" and project_meta.is_public = true));--> statement-breakpoint
CREATE POLICY "relationships_public_read" ON "relationships" AS PERMISSIVE FOR SELECT TO "app_user" USING (exists (select 1 from project_meta where project_meta.id = "relationships"."project_id" and project_meta.is_public = true));--> statement-breakpoint
CREATE POLICY "chunks_public_read" ON "chunks" AS PERMISSIVE FOR SELECT TO "app_user" USING (exists (select 1 from project_meta where project_meta.id = "chunks"."project_id" and project_meta.is_public = true));

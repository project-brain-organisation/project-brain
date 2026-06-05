--> statement-breakpoint
ALTER TABLE "project_meta" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "project_meta_owner_isolation" ON "project_meta" AS PERMISSIVE FOR ALL TO "app_user" USING ("owner_id" = current_setting('app.current_user_id', true)::uuid) WITH CHECK ("owner_id" = current_setting('app.current_user_id', true)::uuid);
--> statement-breakpoint
CREATE POLICY "project_meta_public_read" ON "project_meta" AS PERMISSIVE FOR SELECT TO "app_user" USING ("is_public" = true);

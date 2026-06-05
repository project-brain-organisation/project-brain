--> statement-breakpoint
ALTER TABLE "thoughts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "thoughts_owner_isolation" ON "thoughts" AS PERMISSIVE FOR ALL TO "app_user" USING ("owner_id" = current_setting('app.current_user_id', true)::uuid) WITH CHECK ("owner_id" = current_setting('app.current_user_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "labels" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "labels_owner_isolation" ON "labels" AS PERMISSIVE FOR ALL TO "app_user" USING ("owner_id" = current_setting('app.current_user_id', true)::uuid) WITH CHECK ("owner_id" = current_setting('app.current_user_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "relationships" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "relationships_owner_isolation" ON "relationships" AS PERMISSIVE FOR ALL TO "app_user" USING ("owner_id" = current_setting('app.current_user_id', true)::uuid) WITH CHECK ("owner_id" = current_setting('app.current_user_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "chunks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "chunks_owner_isolation" ON "chunks" AS PERMISSIVE FOR ALL TO "app_user" USING ("owner_id" = current_setting('app.current_user_id', true)::uuid) WITH CHECK ("owner_id" = current_setting('app.current_user_id', true)::uuid);

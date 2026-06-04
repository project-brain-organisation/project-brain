CREATE TYPE "public"."entity_type" AS ENUM('project', 'thought', 'label');--> statement-breakpoint
CREATE TYPE "public"."relationship_kind" AS ENUM('hierarchy', 'tag', 'edge');--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"type" "entity_type" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_meta" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"emoji" varchar(16),
	"is_public" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(50) NOT NULL,
	"provider_id" varchar(255) NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_provider_provider_id" UNIQUE("provider","provider_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thoughts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"color" varchar(7),
	"body" text DEFAULT '' NOT NULL,
	"title" varchar(255) DEFAULT '' NOT NULL,
	"content_hash" varchar(64),
	"canvas_x" integer,
	"canvas_y" integer,
	"width" integer,
	"height" integer
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"color" varchar(7) DEFAULT '#999999' NOT NULL,
	"is_edge" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"kind" "relationship_kind" NOT NULL,
	"label_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thought_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"body" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"vector_embedding" vector(768),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_auth_codes" (
	"code" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" varchar(255) NOT NULL,
	"code_challenge" varchar(128),
	"code_challenge_method" varchar(10) DEFAULT 'S256',
	"redirect_uri" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"consumed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "mcp_refresh_tokens" (
	"token" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"rotated_from" varchar(64)
);
--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_project_id_entities_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_meta" ADD CONSTRAINT "project_meta_id_entities_id_fk" FOREIGN KEY ("id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_meta" ADD CONSTRAINT "project_meta_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thoughts" ADD CONSTRAINT "thoughts_id_entities_id_fk" FOREIGN KEY ("id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_id_entities_id_fk" FOREIGN KEY ("id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_project_id_entities_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_source_id_entities_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_target_id_entities_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_label_id_entities_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_thought_id_thoughts_id_fk" FOREIGN KEY ("thought_id") REFERENCES "public"."thoughts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_project_id_entities_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_auth_codes" ADD CONSTRAINT "mcp_auth_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_refresh_tokens" ADD CONSTRAINT "mcp_refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_entities_project_id" ON "entities" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_meta_owner_id" ON "project_meta" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_relationships_project_id" ON "relationships" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_relationships_source_kind" ON "relationships" USING btree ("source_id","kind");--> statement-breakpoint
CREATE INDEX "idx_relationships_target_kind" ON "relationships" USING btree ("target_id","kind");--> statement-breakpoint
CREATE INDEX "idx_relationships_label_id" ON "relationships" USING btree ("label_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_relationship_hierarchy_source" ON "relationships" USING btree ("source_id") WHERE kind = 'hierarchy';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_relationship_tag_source_target" ON "relationships" USING btree ("source_id","target_id") WHERE kind = 'tag';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_relationship_edge_source_target_label" ON "relationships" USING btree ("source_id","target_id","label_id") WHERE kind = 'edge';--> statement-breakpoint
CREATE INDEX "idx_chunks_thought_id" ON "chunks" USING btree ("thought_id");--> statement-breakpoint
CREATE INDEX "idx_chunks_project_id" ON "chunks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_mcp_auth_codes_expires_at" ON "mcp_auth_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_mcp_auth_codes_user_client" ON "mcp_auth_codes" USING btree ("user_id","client_id");--> statement-breakpoint
CREATE INDEX "idx_mcp_refresh_tokens_expires_at" ON "mcp_refresh_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_mcp_refresh_tokens_user_client" ON "mcp_refresh_tokens" USING btree ("user_id","client_id");
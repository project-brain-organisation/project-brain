CREATE TABLE "chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thought_id" uuid NOT NULL,
	"body" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"vector_embedding" vector(768),
	"created_at" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
	"used" varchar(5) DEFAULT 'false'
);
--> statement-breakpoint
CREATE TABLE "mcp_refresh_tokens" (
	"token" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked" varchar(5) DEFAULT 'false'
);
--> statement-breakpoint
CREATE TABLE "thought_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thought_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thoughts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"parent_id" uuid,
	"is_root" boolean DEFAULT false NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"title" varchar(255) DEFAULT '' NOT NULL,
	"content_hash" varchar(64),
	"canvas_x" integer,
	"canvas_y" integer,
	"width" integer,
	"height" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_thought_id_thoughts_id_fk" FOREIGN KEY ("thought_id") REFERENCES "public"."thoughts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_auth_codes" ADD CONSTRAINT "mcp_auth_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_refresh_tokens" ADD CONSTRAINT "mcp_refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thought_labels" ADD CONSTRAINT "thought_labels_thought_id_thoughts_id_fk" FOREIGN KEY ("thought_id") REFERENCES "public"."thoughts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thought_labels" ADD CONSTRAINT "thought_labels_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thoughts" ADD CONSTRAINT "thoughts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thoughts" ADD CONSTRAINT "thoughts_parent_id_thoughts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."thoughts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_chunks_thought_id" ON "chunks" USING btree ("thought_id");--> statement-breakpoint
CREATE INDEX "idx_labels_user_id" ON "labels" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_thought_labels_thought_id" ON "thought_labels" USING btree ("thought_id");--> statement-breakpoint
CREATE INDEX "idx_thought_labels_label_id" ON "thought_labels" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "idx_thoughts_user_id" ON "thoughts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_thoughts_content_hash" ON "thoughts" USING btree ("user_id","content_hash");--> statement-breakpoint
CREATE INDEX "idx_thoughts_parent_id" ON "thoughts" USING btree ("parent_id");
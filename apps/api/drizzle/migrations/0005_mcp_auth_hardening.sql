ALTER TABLE "mcp_auth_codes"
  ALTER COLUMN "used" DROP DEFAULT;

ALTER TABLE "mcp_auth_codes"
  ALTER COLUMN "used" TYPE boolean USING ("used" = 'true'),
  ALTER COLUMN "used" SET DEFAULT false,
  ALTER COLUMN "used" SET NOT NULL;

ALTER TABLE "mcp_auth_codes"
  ADD COLUMN IF NOT EXISTS "consumed_at" timestamp;

CREATE INDEX IF NOT EXISTS "idx_mcp_auth_codes_expires_at"
  ON "mcp_auth_codes" ("expires_at");

CREATE INDEX IF NOT EXISTS "idx_mcp_auth_codes_user_client"
  ON "mcp_auth_codes" ("user_id", "client_id");

ALTER TABLE "mcp_refresh_tokens"
  ALTER COLUMN "revoked" DROP DEFAULT;

ALTER TABLE "mcp_refresh_tokens"
  ALTER COLUMN "revoked" TYPE boolean USING ("revoked" = 'true'),
  ALTER COLUMN "revoked" SET DEFAULT false,
  ALTER COLUMN "revoked" SET NOT NULL;

ALTER TABLE "mcp_refresh_tokens"
  ADD COLUMN IF NOT EXISTS "rotated_from" varchar(64);

CREATE INDEX IF NOT EXISTS "idx_mcp_refresh_tokens_expires_at"
  ON "mcp_refresh_tokens" ("expires_at");

CREATE INDEX IF NOT EXISTS "idx_mcp_refresh_tokens_user_client"
  ON "mcp_refresh_tokens" ("user_id", "client_id");

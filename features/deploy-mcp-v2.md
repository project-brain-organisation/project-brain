# Deploy MCP V2 to Railway

Railway currently serves the old V1 app at
`https://project-brain-production-fb2d.up.railway.app` (only `remember` +
`elaborate`). V2 in this repo has 20 tools and a spec-compliant OAuth flow,
verified end-to-end locally on 2026-07-11. This checklist gets V2 live.

## 1. Point the Railway services at V2

- [ ] In the Railway dashboard, check what the existing service(s) deploy from
      (old repo? old branch?). Either repoint them to this repo/branch or create
      fresh services from it.
- [ ] Service **api**: root directory `apps/api` (Dockerfile build,
      `apps/api/railway.toml` already configured).
- [ ] Service **mcp**: root directory `apps/mcp` (Dockerfile build,
      `apps/mcp/railway.toml` already configured).
- [ ] Both need public domains (Settings → Networking → Generate Domain).
      Note both URLs.

## 2. Environment variables

Generate fresh production secrets (do NOT reuse the dev values in local .env
files): `openssl rand -hex 32` for each secret.

**api service:**
- [ ] `DATABASE_URL` — Neon prod, owner role (existing value if reusing the old service)
- [ ] `DATABASE_URL_APP` — Neon prod, `app_user` role (RLS runtime pool)
- [ ] `JWT_SECRET` — must be IDENTICAL on both services
- [ ] `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- [ ] `GOOGLE_CALLBACK_URL` — `https://<api-domain>/api/auth/google/callback`
      (also add this URL in the Google Cloud console → OAuth client → redirect URIs)
- [ ] `OPENROUTER_API_KEY` — embeddings
- [ ] `FRONTEND_URL` — the web app's URL (CORS + OAuth redirect)
- [ ] `MCP_INTERNAL_KEY` — must be IDENTICAL on both services

**mcp service:**
- [ ] `MCP_SERVER_SECRET`
- [ ] `MCP_INTERNAL_KEY` — same value as api
- [ ] `JWT_SECRET` — same value as api (sidecar verifies API-signed tokens)
- [ ] `INTERNAL_API_URL` — api service URL; prefer Railway private networking
      (`http://api.railway.internal:<port>`), public URL also works
- [ ] `MCP_PUBLIC_API_URL` — the api service's PUBLIC https URL
      (required: OAuth metadata tells clients where the sign-in service lives)
- [ ] `NODE_ENV=production`

## 3. Prod database check

- [ ] V1's prod DB may predate the V2 schema. Verify migrations 0000–0005 are
      applied to prod Neon (note: `drizzle/migrations/meta/_journal.json` only
      registers 0000; 0001–0005 were applied manually — see memory/evolution docs).
      If prod is still V1-shaped, plan the migration before cutting over.

## 4. Verify the deployed MCP server (curl, no client needed)

- [ ] `curl -i -X POST https://<mcp-domain>/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}'`
      → **401 with a `WWW-Authenticate` header** containing `resource_metadata=`
- [ ] `curl https://<mcp-domain>/.well-known/oauth-protected-resource/mcp`
      → JSON where `resource` = `https://<mcp-domain>/mcp` and
      `authorization_servers` = `["https://<api-domain>"]`
- [ ] `curl https://<api-domain>/.well-known/oauth-authorization-server`
      → JSON with authorize/token/register endpoints
- [ ] `curl -i -X POST https://<api-domain>/api/auth/mcp/register -H "Content-Type: application/json" -d '{"redirect_uris":["https://claude.ai/api/mcp/auth_callback"]}'`
      → 201 with a `client_id`

## 5. Cut over the clients

- [ ] Set `VITE_MCP_URL=https://<mcp-domain>/mcp` in the web app's build env
      (McpDialog falls back to the old hardcoded domain otherwise) and redeploy web.
- [ ] Add the connector in claude.ai with `https://<mcp-domain>/mcp`,
      sign in with Google, and confirm all 20 tools appear.
- [ ] Remove/park the old V1 service so it stops burning the usage credit.

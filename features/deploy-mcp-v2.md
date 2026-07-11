# Deploy MCP V2 to prod (single environment, no staging)

Decision 2026-07-11: no staging env, no users yet. The Neon "dev" database
becomes THE prod database (it already has the V2 schema + RLS applied and
verified). The old V1 Neon database (separate Neon account) gets deleted
LAST, after V2 prod is verified — it contains the V1 notes, so export
anything worth keeping before deleting.

## 1. Push the code (blocked on account switch)

- [ ] `main` has the V2 MCP fixes committed locally but CANNOT be pushed as
      `matthewbierrum` (read-only on the org repo). Either
      `gh auth switch -u harvey-flasheart` and `git push origin main`, or
      grant matthewbierrum write access in the org settings.

## 2. Database — the Neon project `flat-rain-19023938`

- [ ] (Optional) Rename it `project-brain-prod` in the Neon console
      (cosmetic; connection strings are unaffected).
- [ ] Connection strings for Railway come from `apps/api/.env`:
      `DATABASE_URL` (owner role) and `DATABASE_URL_APP` (`app_user`).
- [ ] (Recommended) Rotate the `app_user` password before prod use — the
      current one was generated for dev and sits in local .env files:
      `ALTER ROLE app_user WITH PASSWORD '<new>'` + update both env values.
- [ ] (Optional) Clean dev cruft: seed users `matt-dev`/`mallory-dev` and the
      test projects "Project Brain Test Project" / "MCP smoke test".
      Your real Google user ("Matt Bierrum") is already there and stays.

## 3. Railway services

- [ ] Repoint the existing service (or create fresh services) to deploy from
      this repo, branch `main`:
      - **api**: root directory `apps/api` (Dockerfile build)
      - **mcp**: root directory `apps/mcp` (Dockerfile build)
- [ ] Public domains on both (Settings → Networking). Note the URLs.
- [ ] If the web app is also hosted on Railway, keep/point its service at
      `apps/web` and set `VITE_MCP_URL=https://<mcp-domain>/mcp` at build time.

## 4. Environment variables

Generate fresh secrets for prod: `openssl rand -hex 32` each.

**api service:**
- [ ] `DATABASE_URL` — Neon owner string (section 2)
- [ ] `DATABASE_URL_APP` — Neon `app_user` string (section 2)
- [ ] `JWT_SECRET` — IDENTICAL on both services
- [ ] `MCP_INTERNAL_KEY` — IDENTICAL on both services
- [ ] `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- [ ] `GOOGLE_CALLBACK_URL` — `https://<api-domain>/api/auth/google/callback`
      (register the same URL in Google Cloud console → OAuth client)
- [ ] `OPENROUTER_API_KEY` — embeddings
- [ ] `FRONTEND_URL` — the web app's public URL (CORS + OAuth redirect)

**mcp service:**
- [ ] `MCP_SERVER_SECRET` — fresh secret
- [ ] `MCP_INTERNAL_KEY` — same as api
- [ ] `JWT_SECRET` — same as api (sidecar verifies API-signed tokens)
- [ ] `INTERNAL_API_URL` — api URL (Railway private networking preferred)
- [ ] `MCP_PUBLIC_API_URL` — the api service's PUBLIC https URL (OAuth
      discovery tells clients where the sign-in service lives — required)
- [ ] `NODE_ENV=production`

## 5. Verify from the outside (curl, before touching claude.ai)

- [ ] `curl -i -X POST https://<mcp-domain>/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}'`
      → **401 with `WWW-Authenticate`** containing `resource_metadata=`
- [ ] `curl https://<mcp-domain>/.well-known/oauth-protected-resource/mcp`
      → `resource` = `https://<mcp-domain>/mcp`,
      `authorization_servers` = `["https://<api-domain>"]`
- [ ] `curl https://<api-domain>/.well-known/oauth-authorization-server`
      → authorize/token/register endpoints
- [ ] `curl -i -X POST https://<api-domain>/api/auth/mcp/register -H "Content-Type: application/json" -d '{"redirect_uris":["https://claude.ai/api/mcp/auth_callback"]}'`
      → 201 with a `client_id`

## 6. Cut over and clean up (ONLY after 5 passes)

- [ ] Add the claude.ai connector: `https://<mcp-domain>/mcp`, sign in with
      Google, confirm all 20 tools appear and `remember` works.
- [ ] Log into the web app in prod, confirm normal use.
- [ ] Export anything worth keeping from the OLD V1 Neon database
      (other Neon account), then delete it.
- [ ] Delete/park the old V1 Railway service if a new one replaced it.

## Later (when there are users)

- Duplicate this setup as a `staging` Railway environment + a Neon branch
  for the staging DB; deploy staging from a `staging` branch.

# Full Code Review — Project Brain V2

**Date:** 2026-07-13
**Scope:** Full application — API (auth, RLS/tenant layer, services, controllers, schema, bootstrap), MCP sidecar, and web frontend.

## Summary

Overall a well-structured codebase. The RLS + `asUser()` tenant isolation design is sound and consistently applied, the MCP tool registry with Zod-derived JSON schemas is clean, and the layering (controller → service → RLS-scoped transaction) is disciplined. Findings below are ordered by severity.

---

## High severity

### 1. Fire-and-forget embedding pipeline swallows all errors silently
[thoughts.service.ts:59-63](../apps/api/src/workspace/thoughts/thoughts.service.ts#L59)

The fire-and-forget `chunkAndEmbed` swallows all errors into a `logger.warn`. If embeddings consistently fail (bad `OPENROUTER_API_KEY`, model outage), thoughts save but are silently never searchable, with no user-visible signal and no retry/backfill.

**Recommendation:** Surface pipeline health or add a retry queue / backfill mechanism.

### 2. MCP server key accepted from query parameter — fail-open on unset `NODE_ENV`
[auth.ts:10-16](../apps/mcp/src/auth.ts#L10), [main.ts:50-58](../apps/mcp/src/main.ts#L50)

`getMcpServerKey` accepts the key from a **query parameter** in non-production. Query strings land in access logs, proxy logs, and browser history. The branch is gated to non-prod, but `NODE_ENV` defaults to `undefined` (not `"production"`), so if it is ever unset in a deployed environment this branch activates — the gate is fail-open.

**Recommendation:** Confirm `NODE_ENV=production` is set in every deployed environment; consider removing the query-param path entirely or making the gate fail-closed.

---

## Medium severity

### 3. `assertOwnership` interaction with public-project read policy
[projects.service.ts:14-21](../apps/api/src/projects/projects.service.ts#L14), [thought.schema.ts:19-26](../apps/api/src/database/schema/thought.schema.ts#L19)

`assertOwnership` runs inside `asUser(userId)`, so RLS already hides other tenants' rows — except public projects, which are visible via `project_meta_public_read`. `assertOwnership` correctly rejects writes to a public project you don't own (403). The schema comment claims this is the "SOLE remaining app-layer ownership check."

**Recommendation:** Confirm the public-project read path cannot be used to write child thoughts through any other endpoint.

### 4. Update paths bypass Zod validation
[projects.controller.ts:45](../apps/api/src/projects/projects.controller.ts#L45), [labels.controller.ts:45](../apps/api/src/workspace/labels/labels.controller.ts#L45)

Create paths use `ZodValidationPipe`, but updates use plain DTO classes (`Partial<CreateProjectDto>`, `UpdateLabelDto`) with no class-validator decorators. The global `ValidationPipe({ whitelist: true })` strips unknown keys, but there is no type/format validation — e.g. a malformed `color` or over-length `name` reaches the DB unchecked (relying on column limits to throw a 500 rather than a clean 400). No `updateLabelSchema`/`updateProjectSchema` exists.

**Recommendation:** Add update-path Zod schemas for parity with create paths.

### 5. N+1 queries in internal MCP controller
[internal-mcp.controller.ts:216-224](../apps/api/src/internal-mcp/internal-mcp.controller.ts#L216), [internal-mcp.controller.ts:349-364](../apps/api/src/internal-mcp/internal-mcp.controller.ts#L349), [internal-mcp.controller.ts:156-160](../apps/api/src/internal-mcp/internal-mcp.controller.ts#L156)

`elaborate` / `thought-to-prompt` / `getThoughtLabels` fetch labels one-by-one inside the transaction (a query per label). Siblings/children are fetched via `Promise.all(findOne)`, and each `findOne` opens its own `asUser` transaction — a thought with 20 children opens 20 transactions.

**Recommendation:** Use a single `inArray(labels.id, targetIds)` fetch; batch child/sibling loads.

### 6. Inconsistent and oversized request body limits
[main.ts:107](../apps/api/src/main.ts#L107)

The API sets `json({ limit: '50mb' })` globally while the OAuth register route uses `1mb` and the MCP sidecar uses `1mb`. Thought bodies are capped at 50k chars in Zod, so 50mb is far beyond any legitimate payload — a DoS vector on an authenticated-but-cheap endpoint.

**Recommendation:** Reduce global limit to `1mb`–`2mb`.

### 7. Cookie auth is CSRF-exposed to claude.ai origin
[main.ts:111-118](../apps/api/src/main.ts#L111)

CORS `origin` hardcodes `https://claude.ai` with `credentials: true`. Combined with cookie auth (`sameSite: 'none'` in prod), any page on claude.ai can make credentialed requests to the API. This is the intended trust relationship, but there is no CSRF token on state-changing routes.

**Recommendation:** Consider a CSRF mitigation, or require the bearer path for cross-origin requests.

---

## Low severity / cleanup

### 8. Read paths return empty array instead of 404/403 for non-owned project
[thoughts.service.ts:123](../apps/api/src/workspace/thoughts/thoughts.service.ts#L123)

`findByProject` for thoughts/labels does not call `assertOwnership` (by design — RLS handles it). Querying a nonexistent or non-owned projectId returns an empty array (200) rather than 404/403. Minor API-shape inconsistency versus the mutation paths that 403.

### 9. Redundant header re-read in internal MCP controller
[internal-mcp.controller.ts:34-40](../apps/api/src/internal-mcp/internal-mcp.controller.ts#L34)

`userIdFromHeaders` re-reads `x-mcp-user-id` even though `McpInternalGuard` already validated its presence. The controller's `UnauthorizedException` is effectively dead code.

**Recommendation:** Read from a typed request property the guard sets.

### 10. No timeout on embedding fetch
[embedding.service.ts:14](../apps/api/src/workspace/pipeline/embedding.service.ts#L14)

`EmbeddingService.embed` has no timeout on the fetch. A hung OpenRouter connection blocks the fire-and-forget pipeline indefinitely.

**Recommendation:** Add an `AbortSignal.timeout()`.

### 11. NetworkView color parsing assumes valid 6-digit hex
[NetworkView.tsx:150-154](../apps/web/src/components/NetworkView.tsx#L150)

`parseInt` on malformed input yields `NaN` → `rgb(NaN,...)`. The API validates hex on write, but the project root color comes from `project.color`, which has looser update validation (see finding 4).

**Recommendation:** Add a defensive fallback.

### 12. Dead / duplicated OAuth metadata
[auth.controller.ts:26-48](../apps/api/src/auth/auth.controller.ts#L26), [main.ts:31-55](../apps/api/src/main.ts#L31)

`AuthController.getMcpAuthorizationServerMetadata` and `getMcpProtectedResourceMetadata` are public methods with no `@Get` decorator — never routed. The actual well-known endpoints are defined imperatively in `main.ts`. The two versions already disagree: the controller sets `issuer` to `${base}/api/auth/mcp`, main.ts sets it to `base`.

**Recommendation:** Remove the dead controller methods to avoid drift.

---

## Notes on things that are correct

- The ALS/interceptor rewrite is right — the comments accurately document why the old guard-based approach was broken, and wrapping `next.handle()` in `tenantStorage.run()` is the correct fix.
- PKCE S256 validation, one-time auth codes, and refresh-token rotation with `rotatedFrom` chaining are implemented correctly ([auth.service.ts:185-277](../apps/api/src/auth/auth.service.ts#L185)).
- `McpInternalGuard` uses `timingSafeEqual` with a length pre-check — correct constant-time comparison.
- RLS policies are consistent across all five tenant tables with matching `using`/`withCheck` clauses.

---

## Top recommendations

1. Fix the fail-open `NODE_ENV` gate (finding 2).
2. Drop the 50mb body limit (finding 6).
3. Add update-path validation schemas (finding 4).
4. Batch the N+1 queries in the internal MCP controller (finding 5).

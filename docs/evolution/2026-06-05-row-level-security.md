# Evolution: row-level-security

**Date**: 2026-06-05
**Feature ID**: row-level-security
**Status**: DELIVERED

---

## Feature Summary

Implemented multi-tenant row-level security (RLS) for the NestJS/Drizzle/Neon Postgres API. Owner identity (`owner_id`) is denormalized onto five tables (`project_meta`, `thoughts`, `labels`, `relationships`, `chunks`), a non-owner database role (`app_user`) enforces RLS policies at the Postgres layer, and per-request tenant context is wired through `AsyncLocalStorage`-backed `asUser()` / `asSystem()` wrappers. Every authenticated request runs all database access inside a tenant-scoped transaction; the database itself guarantees cross-tenant isolation without any application-layer ownership checks on read/write paths.

## Business Context

Project Brain is a multi-tenant system in which each user owns projects and all associated workspace entities. Prior to this feature, tenant isolation was enforced exclusively at the application layer via `assertOwnership()` calls in service methods. This approach had two weaknesses: isolation could be silently bypassed by any service path that omitted the check, and there was no defense-in-depth against future regressions. This feature moves isolation enforcement to the database, where it is unconditional. The `app_user` Postgres role holds no table ownership, so RLS policies are always active and cannot be bypassed by the application. Each user's data is now isolated at the database layer — even a compromised or buggy service path cannot read or write another tenant's rows.

---

## Key Decisions and Deviations

1. **Denormalized `owner_id` on all four subtype tables** — `thoughts`, `labels`, `relationships`, and `chunks` each carry a local `owner_id` (uuid, notNull, FK → `users.id` cascade) mirroring `project_meta.owner_id`. RLS policies on the subtype tables key on the local column, avoiding a join to `project_meta` on every guarded query. Immutability is enforced: `owner_id` is stamped once at insert and never updated.

2. **`app_user` non-owner role as the runtime connection** — The application connects via a separate `DATABASE_URL_APP` using the `app_user` login role, which holds only DML grants and owns no tables. Because RLS is only automatically enforced for non-owners, this design makes RLS unconditionally active without needing `FORCE ROW LEVEL SECURITY`.

3. **`AsyncLocalStorage` tenant context, not middleware** — `DatabaseService.asUser(userId, cb)` runs a transaction that calls `SET LOCAL app.current_user_id = <userId>` (transaction-local, never session-leaked) and exposes a scoped transaction handle. `asSystem(cb)` runs without setting `app.current_user_id` for genuinely tenant-less operations.

4. **JWT guard replaced with `TenantContextInterceptor`** — The original roadmap wired the `AsyncLocalStorage` store inside the JWT guard. During the adversarial review, blocker B1 identified that JWT guards fire outside the NestJS execution context, causing ALS context to leak across async boundaries. The fix moved tenant-context population to a `TenantContextInterceptor` (NestJS lifecycle-aware) and wrapped the `asUser()` call around the full request handler. The JWT guard was retained for authentication only.

5. **UI-1: pipeline writes run under `asUser(ownerId)`, not `asSystem`** — The original roadmap stated that fire-and-forget pipeline work (`chunkAndEmbed`, `rechunk`) would run under `asSystem`. During Phase 1 orchestrator review, it was discovered that the `chunks` table carries an RLS `withCheck` policy requiring `owner_id = current_setting('app.current_user_id', true)::uuid`. Under `asSystem`, `current_setting` returns NULL and the INSERT is silently rejected (swallowed by `.catch()`), causing chunks to never persist. Resolution (user decision, 2026-06-05): pipeline writes resolve the project's `owner_id` and wrap all DB writes in `DatabaseService.asUser(ownerId, cb)`. `asSystem` is retained only for operations that do not write RLS-protected tables (e.g. gateway event broadcasts). This affected steps 02-02, 01-02, and 04-01; crafters received the correction via `DESIGN_CONTEXT`.

6. **Adversarial review blocker B5 — `semanticSearch` not in `asUser`** — The adversarial review (L1-L6 refactoring pass) identified that `semanticSearch()` in `ThoughtsService` executed a raw vector-similarity query outside any `asUser()` wrapper, meaning the RLS `USING` clause on `thoughts` would see no `app.current_user_id` and return zero rows (or, worse, all rows depending on policy permissiveness). The fix wrapped `semanticSearch` in `asUser(userId, cb)` using the userId from the request context.

7. **Retained project-type FK invariant, removed redundant ownership checks** — Step 04-01 removed `assertOwnership`'s tenant-isolation role from read/write paths (now enforced by RLS). The project-type FK check (rejecting a non-project-type `projectId` on create) was retained as the sole remaining app-layer ownership-adjacent check, since RLS does not enforce entity type.

8. **Mutation testing skipped** — Stryker is not installed in the project. Compensating measures: RED-phase verification for all tests before GREEN implementation, adversarial review (two blockers identified and resolved), and property-based tests with `fast-check` (`strict=true`) covering state-delta invariants. See mutation report: `docs/feature/row-level-security/deliver/mutation/mutation-report.md`.

---

## Implementation Steps Completed

All 8 steps passed in a single delivery session on 2026-06-05.

| Step | Name | Commit | Result |
|------|------|--------|--------|
| 01-01 | Add owner_id column + index to four subtype schemas | `f25abd5` | PASS |
| 01-02 | Migration: add, backfill, constrain owner_id; stamp on insert | `3f64a85` | PASS |
| 02-01 | Create app_user login role; connect runtime as it | `61d8ac9` | PASS |
| 02-02 | Add asUser/asSystem tenant-context wrappers; wire pipeline under asUser(owner) | `8712df4` | PASS |
| 03-01 | Enable drizzle role management; add project_meta RLS policies | `116c5ca` | PASS |
| 03-02 | Add owner_id-keyed RLS policies to four subtype tables | `adad7b4` | PASS |
| 03-03 | Cross-tenant integration test: zero rows for second user | `4e5ce93` | PASS |
| 04-01 | Remove RLS-redundant ownership checks; retain project-type FK invariant | `5477b5d` | PASS |

**Post-delivery:**
- L1-L6 refactoring pass: `d539d82`
- Adversarial review fix (B1 ALS wiring + B5 semanticSearch): `77dfbd4`

### Phase Breakdown

**Phase 01 — Schema + Migration**

- `thoughts`, `labels`, `relationships`, `chunks` schemas each received `ownerId` (uuid, notNull, FK → `users.id` cascade) and `idx_<table>_owner_id` btree index.
- Migration: ADD nullable → UPDATE backfill (via `project_id → project_meta.owner_id`) → SET NOT NULL → ADD FK → CREATE INDEX. No existing row violates NOT NULL.
- `create()` paths and `chunkAndEmbed()` stamp `owner_id` at insert (resolved from the project's owner); no method updates `owner_id`.

**Phase 02 — Non-owner Role + Tenant Context**

- `app_user` login role created via migration: GRANT USAGE on schema/sequences, GRANT SELECT/INSERT/UPDATE/DELETE on six app tables; no table ownership.
- `DatabaseService` connects via `DATABASE_URL_APP` (app_user), keeping `DATABASE_URL` for Drizzle-kit migrations.
- `DatabaseService.asUser(userId, cb)` and `asSystem(cb)` implemented via `AsyncLocalStorage`; `TenantContextInterceptor` populates context for authenticated requests. Post-review fix (B1): moved ALS population from JWT guard to interceptor to prevent context leakage.
- Fire-and-forget pipeline writes run under `asUser(resolvedOwnerId)` per UI-1 resolution.

**Phase 03 — RLS Policies**

- `project_meta` enables RLS with `owner_isolation` (FOR ALL, using/withCheck owner_id = current_setting cast to uuid) and `public_read` (FOR SELECT, using isPublic = true) policies via Drizzle 0.45.2 third-arg array API.
- All four subtype tables enable RLS with `<table>_owner_isolation` policies keyed on local `owner_id`.
- Cross-tenant integration test seeds two users, connects as `app_user`, and asserts zero rows cross-tenant on all five tables, write rejection on withCheck violation, and public project readability.

**Phase 04 — Slim App-Layer Checks**

- `assertOwnership` tenant-isolation role removed from thoughts, labels, relationships, and pipeline service read/write paths.
- Project-type FK invariant retained wherever a DTO `projectId` is accepted on `create()`.
- `ThoughtsService.semanticSearch()` wrapped in `asUser()` (B5 fix).

---

## Issues Encountered

### B1 — ALS Context Leakage in JWT Guard (BLOCKER)

**Identified**: adversarial review pass (L1-L6 refactoring, 2026-06-05).

The original implementation populated the `AsyncLocalStorage` store inside the JWT guard. NestJS JWT guards execute in a Passport.js context that is not fully integrated into the NestJS async lifecycle, causing ALS values to leak across concurrent requests at high concurrency.

**Resolution**: moved tenant context population to a `TenantContextInterceptor` that wraps the entire request handler execution. The interceptor runs inside the NestJS lifecycle, so `AsyncLocalStorage.run()` correctly scopes the context to the request. The JWT guard was retained for authentication validation only. Commit `77dfbd4`.

### B5 — `semanticSearch` Executing Outside Tenant Context (BLOCKER)

**Identified**: adversarial review pass (L1-L6 refactoring, 2026-06-05).

`ThoughtsService.semanticSearch()` executed its raw vector-similarity query without an `asUser()` wrapper. Under the RLS `USING` policy on `thoughts`, `current_setting('app.current_user_id', true)` returns NULL outside a tenant context, causing the query to return zero results (policy-filtered) or behave unpredictably depending on policy permissiveness.

**Resolution**: wrapped `semanticSearch` in `DatabaseService.asUser(userId, cb)` using the `userId` obtained from the request-scoped ALS context. Commit `77dfbd4`.

### UI-1 — Fire-and-forget Pipeline Writes vs. Chunks RLS withCheck (UPSTREAM ISSUE)

**Identified**: Phase 1 orchestrator review (2026-06-05). Full detail: `docs/feature/row-level-security/deliver/upstream-issues.md`.

The roadmap stated pipeline writes run under `asSystem`, but the `chunks` RLS withCheck requires `app.current_user_id` to be set. Under `asSystem`, the INSERT is rejected silently (swallowed by `.catch()`), causing chunks to never persist.

**Resolution**: pipeline writes (`chunkAndEmbed`, `rechunk`) resolve the project's `owner_id` and wrap all DB writes in `asUser(ownerId, cb)`. `asSystem` is retained only for tenant-less operations that do not write RLS-protected tables. Affected steps 02-02, 01-02, and 04-01.

---

## Test Coverage Summary

**205 tests** across 11 test files, all green.

| Test File | Steps | Focus |
|-----------|-------|-------|
| `apps/api/test/schema/owner-id-denormalization.spec.ts` | 01-01 | Schema metadata: owner_id column shape, index declaration (4 subtype tables) |
| `apps/api/test/schema/owner-id-backfill.spec.ts` | 01-02 | Property: backfilled owner_id equals project_meta.owner_id for every generated fixture |
| `apps/api/test/database/app-user-role.spec.ts` | 02-01 | app_user holds DML grants, owns no tables, runtime connects as app_user |
| `apps/api/test/database/tenant-context.spec.ts` | 02-02 | Property: asUser sets app.current_user_id to arbitrary userId and unsets on exit; asSystem never sets it |
| `apps/api/test/schema/rls-policies-project-meta.spec.ts` | 03-01 | project_meta RLS: owner_isolation (FOR ALL) and public_read (FOR SELECT) via 0.45.2 third-arg API |
| `apps/api/test/schema/rls-policies-subtypes.spec.ts` | 03-02 | Subtype RLS: owner_isolation policies on thoughts, labels, relationships, chunks |
| `apps/api/test/integration/rls-cross-tenant.spec.ts` | 03-03 | Integration: 12 cross-tenant assertions — zero rows cross-tenant, write rejection, public project readable |
| `apps/api/test/workspace/ownership-check-removal.spec.ts` | 04-01 | Property: create() rejects non-project-type projectId; NotFound/cascade behavior preserved |
| Schema unit suite (93 total) | 01-01, 01-02, 03-01, 03-02 | Static schema invariants across all RLS-configured tables |
| Workspace unit suite (112 total) | 02-02, 04-01 | Service-layer property tests for tenant wiring and ownership check removal |

**12 cross-tenant integration assertions** (03-03): SELECT returns zero cross-tenant rows on all 5 tables; INSERT/UPDATE withCheck violation rejected; public project SELECT permitted.

Testing approach: property-based tests with `fast-check` (`strict=true`) for service and database behavior; static structural assertions for schema metadata; single-example integration test for real Postgres RLS enforcement. RED phase verified for all tests before GREEN implementation.

---

## Lessons Learned

1. **RLS policy design must account for all write paths, including fire-and-forget.** The `chunks` withCheck failure (UI-1) was invisible at the schema design stage because the rejection is swallowed by `.catch()`. Design-time rule: any async write path to an RLS-guarded table must resolve and propagate the tenant context, even if the write is not awaited by the caller.

2. **ALS context scoping requires framework lifecycle awareness.** `AsyncLocalStorage.run()` must wrap the entire execution unit that shares the context. In NestJS, this means a lifecycle-integrated interceptor, not a guard or middleware that executes outside the request handler scope.

3. **Adversarial review catches correctness issues that static analysis misses.** Both B1 (ALS leakage) and B5 (semanticSearch outside tenant context) are runtime concurrency/context issues that compile and lint cleanly. Structured adversarial review with explicit threat categories is necessary for security-critical features.

4. **RLS is defense-in-depth, not a replacement for structured DB access patterns.** Removing `assertOwnership` from service read/write paths is safe only because all access flows through `asUser()`. Any future code path that directly accesses the DB outside `asUser` will silently get zero results rather than throwing. Document the invariant: "all service DB access must go through `asUser()` or `asSystem()`."

5. **Mutation testing infrastructure should be provisioned before delivery, not during.** Stryker absence was discovered at delivery time for the second consecutive feature. Recommendation carries forward from `denormalize-project-id`: add `@stryker-mutator/core` and `@stryker-mutator/jest-runner` to devDependencies in a dedicated infrastructure step.

---

## Lasting Artifacts

**Working artifacts** (preserved for history): `docs/feature/row-level-security/deliver/`

**Upstream issue detail**: `docs/feature/row-level-security/deliver/upstream-issues.md`

**Mutation skip report**: `docs/feature/row-level-security/deliver/mutation/mutation-report.md`

No prior-wave design artifacts exist for this feature (no DISCUSS, DESIGN, or DISTILL waves ran — lean adaptation of nWave for this TypeScript project). All lasting value is in the git commits and this document.

**Source changes** (permanent, in git history):

- `apps/api/src/database/schema/thought.schema.ts`
- `apps/api/src/database/schema/label.schema.ts`
- `apps/api/src/database/schema/relationship.schema.ts`
- `apps/api/src/database/schema/chunk.schema.ts`
- `apps/api/src/database/schema/project-meta.schema.ts`
- `apps/api/drizzle/migrations/` (owner_id + RLS policy migrations)
- `apps/api/src/database/database.service.ts` (`asUser`, `asSystem`, `app_user` pool)
- `apps/api/src/auth/tenant-context.interceptor.ts`
- `apps/api/src/workspace/thoughts/thoughts.service.ts`
- `apps/api/src/workspace/labels/labels.service.ts`
- `apps/api/src/workspace/relationships/relationships.service.ts`
- `apps/api/src/workspace/pipeline/pipeline.service.ts`
- `apps/api/test/schema/owner-id-denormalization.spec.ts`
- `apps/api/test/schema/owner-id-backfill.spec.ts`
- `apps/api/test/database/app-user-role.spec.ts`
- `apps/api/test/database/tenant-context.spec.ts`
- `apps/api/test/schema/rls-policies-project-meta.spec.ts`
- `apps/api/test/schema/rls-policies-subtypes.spec.ts`
- `apps/api/test/integration/rls-cross-tenant.spec.ts`
- `apps/api/test/workspace/ownership-check-removal.spec.ts`

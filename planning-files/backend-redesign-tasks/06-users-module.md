# Task 06 — `UsersModule`

**Read first:** `../backend-redesign-v2.md` §4 (module table).
**Depends on:** 05. **Blocks:** 07.

## Goal
Extract user-profile management into its own `UsersModule`, split out of `AuthModule`.
Plain profile CRUD over the `users` table — no auth/session/hashing logic (that stays in
`AuthModule`).

## Requirements
Create `apps/api/src/users/`:
- `users.module.ts` — declares `UsersService`, exports it for `AuthModule`/`ProjectsModule`.
- `users.service.ts` — methods over the `users` table via `DatabaseService`:
  - `findById(id)`, `findByCredential(...)` as needed by auth, `create(...)`, `update(...)`.
  - Look at how `AuthModule` currently touches `users`/`credentials`
    (`apps/api/src/auth/auth.service.ts`) and move the pure user-record operations here;
    leave token/credential/session logic in auth.
- A `users.controller.ts` is optional — only add profile endpoints if the web app needs
  them; otherwise service-only is fine. State which you chose.

## Wiring
- `AuthModule` imports `UsersModule` and depends on `UsersService` for profile lookups
  (per the plan: "AuthModule … depends strictly on the user module to verify profiles").
- Do **not** move `credentials`, `mcp_auth_codes`, or `mcp_refresh_tokens` handling here —
  those remain auth concerns.

## Acceptance criteria
- `npm run build` succeeds.
- Auth flows still resolve a user (no behavioural regression in login/JWT issuance).
- `UsersService` is the single place that creates/reads/updates `users` rows.

## Out of scope
- `project_meta` (task 07).

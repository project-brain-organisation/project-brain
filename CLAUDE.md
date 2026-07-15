# Project Brain V2

**Before researching the codebase, read [features/codebase-overview.md](features/codebase-overview.md).**
It's a maintained orientation doc — architecture, data model, the RLS/AsyncLocalStorage
multi-tenancy design, auth flows, and the module map — written to save a fresh session from
re-scanning the whole tree. Verify load-bearing details against source, since it can drift.

## Quick facts

- **Monorepo:** `apps/api` (NestJS + Drizzle + Neon Postgres), `apps/mcp` (Express MCP sidecar),
  `apps/web` (React 19 + Vite).
- **Run:** `npm run api | mcp | web` from the repo root. Build: `npm run build:api | build:mcp | build:web`.
- **Multi-tenancy is Postgres RLS.** All runtime DB access goes through `db.asUser(userId, tx => ...)`
  (see `apps/api/src/database/database.service.ts`). Don't add app-layer ownership checks where RLS
  already covers it.
- **Known issues / review findings:** [code-review/2026-07-13-full-app-review.md](code-review/2026-07-13-full-app-review.md).
- **Feature planning:** lightweight `features/*.md` checklists at repo root (not the nWave tooling under `docs/`).

## Notes

- The top-level `README.md` is **stale** — it documents the old v1 single-server app, not this v2 monorepo.
- Keep `features/codebase-overview.md` in sync when the architecture changes materially.

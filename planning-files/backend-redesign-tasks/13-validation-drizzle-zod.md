# Task 13 — Validation: drizzle-zod + ZodValidationPipe

**Read first:** `../backend-redesign-v2.md` §3 (the three validation layers).
**Depends on:** 09, 10, 11. **Blocks:** 15 (so MCP inputs share the same rules).

## Goal
Replace `class-validator` DTOs with drizzle-zod schemas + a NestJS `ZodValidationPipe`,
implementing **only layer 1** (intrinsic, stateless rules). Stateful checks stay in the
services (layers 2–3 already done in tasks 07/09/10/11).

## Requirements
- Add `drizzle-zod` (and `zod` is already a dependency) to `apps/api`.
- Create `apps/api/src/workspace/validation/` with request schemas built from the table
  schemas via `createInsertSchema(table)`, then `.pick()/.omit()/.extend()/.refine()`:
  - **create-thought**: composed from `entities` + `thoughts` inferred schemas (a request
    spans both tables — see §3); require `projectId`, trim-non-empty rules as appropriate,
    `color` matches `/^#[0-9a-fA-F]{6}$/` when present, body length cap.
  - **create-label**: `name` non-empty trimmed, `color` hex regex, `isEdge` boolean.
  - **relationship** inputs: `kind` ∈ enum; `source_id !== target_id` via `.refine()`;
    `label_id` only permitted (shape-wise) when `kind='edge'`.
  - Keep schemas colocated/exported for reuse by the internal-mcp layer (task 15).
- Create a `ZodValidationPipe` (or use a small well-known implementation pattern) and apply
  it to the new controllers (thoughts/labels/relationships/projects).
- **Remove** the old `class-validator` DTO files (`apps/api/src/thoughts/dto/`,
  `apps/api/src/labels/dto/`) and drop `class-validator`/`class-transformer` usage where it
  was only serving these DTOs. Keep `ValidationPipe` global config only if still needed.

## Hard boundary (do not cross)
- **No async/stateful refinements in Zod** — no DB lookups for ownership, existence, or
  uniqueness. Those belong in the services and Postgres constraints, which already exist.
- Endpoint-*type* checks for relationships (tag target must be a label, etc.) stay in the
  relationships service (task 11), not in Zod.

## Acceptance criteria
- `npm run build` succeeds.
- Controllers validate via drizzle-zod schemas; invalid payloads get clean 400s.
- No `class-validator` DTOs remain for thoughts/labels.
- Schemas are exported for the internal-mcp layer to import.

## Out of scope
- internal-mcp wiring (15), gateway (14).

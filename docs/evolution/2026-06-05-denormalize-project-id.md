# Evolution: denormalize-project-id

**Date**: 2026-06-05  
**Feature ID**: denormalize-project-id  
**Status**: DELIVERED

---

## Feature Summary

Added an immutable, denormalized `project_id` column to the `thoughts` and `labels` tables, eliminating the need for cross-table joins to the `entities` table for project-scope resolution. This aligns the schema pattern of `thoughts` and `labels` with `chunks` and `relationships`, which already carried their own `project_id`.

## Business Context

The Project Brain backend previously resolved project ownership for thoughts and labels by joining to the `entities` table on every scoped read. This N+1 entity-lookup pattern created unnecessary coupling, increased query complexity, and diverged from the established schema pattern used by `chunks` and `relationships`. Denormalizing `project_id` onto the subtype tables removes the join, makes scope visible locally, and enforces an immutable ownership guarantee at the database level (FK cascade on `entities.id`, no UPDATE path).

---

## Key Decisions

1. **Safe migration ordering** — ADD nullable first, UPDATE backfill from entities, SET NOT NULL, ADD FK, CREATE INDEX. This prevents NOT NULL violations on pre-existing rows and was validated as the correct ordering in the acceptance criteria review.

2. **Immutability by design** — No service method exposes an UPDATE for `project_id`. The column is written once at insert (stamped from the DTO) and never touched again. The cross-table consistency spec asserts this invariant.

3. **Source-text inspection tests** — `project-scoping-consistency.spec.ts` inspects TypeScript source files directly to assert the "no entities scope-join" architectural invariant. This ensures the no-join guarantee cannot silently regress via a code change that the runtime tests might not catch.

4. **Mutation testing skipped** — Stryker is not installed. Compensating measures: RED-phase verification for all 149 tests, adversarial Testing Theater scan (T1-T7 clear), and property-based tests covering state-delta invariants with `fast-check`.

5. **Static schema steps exempt from property-based paradigm** — Steps 01-01 and 01-02 test TypeScript schema metadata (column shape, index definition), which is a static introspection concern, not runtime behavior. The PBT paradigm exemption was granted; the 01-03 backfill property test compensates by asserting correctness over generated fixtures.

---

## Implementation Steps Completed

All 6 steps passed in a single delivery session on 2026-06-05.

| Step | Name | Phases | Result |
|------|------|--------|--------|
| 01-01 | Add project_id column + index to thought.schema.ts | RED_ACCEPTANCE (skip RED_UNIT per exemption), GREEN, COMMIT | PASS |
| 01-02 | Add project_id column + index to label.schema.ts | RED_ACCEPTANCE (skip RED_UNIT per exemption), GREEN, COMMIT | PASS |
| 01-03 | SQL migration: add nullable, backfill, constrain + index | RED_ACCEPTANCE, GREEN, COMMIT | PASS |
| 02-01 | Refactor thoughts.service.ts to use denormalized project_id | RED_ACCEPTANCE, RED_UNIT, GREEN, COMMIT | PASS |
| 02-02 | Refactor labels.service.ts to use denormalized project_id | RED_ACCEPTANCE, RED_UNIT, GREEN, COMMIT | PASS |
| 03-01 | Verify cross-table project_id uniformity, no entities scope-join | RED_ACCEPTANCE, RED_UNIT, GREEN, COMMIT | PASS |

### Phase Breakdown

**Phase 01 — Schema + Migration**

- `thought.schema.ts`: added `projectId` column (uuid, notNull, FK→entities.id cascade) and `idx_thoughts_project_id` btree index
- `label.schema.ts`: identical pattern
- `0001_denormalize_project_id.sql`: safe ADD nullable → backfill → SET NOT NULL → FK → INDEX

**Phase 02 — Service Refactors**

- `thoughts.service.ts`: `create()` stamps `projectId` from DTO; `findByProject()` filters on `thoughts.projectId` (no entities join); by-id methods resolve scope from the thought row's `project_id`
- `labels.service.ts`: same pattern

**Phase 03 — Cross-Table Verification**

- `project-scoping-consistency.spec.ts`: property-based contract test asserting all four scoped tables (thoughts, labels, relationships, chunks) carry `notNull project_id` with btree index; no read path joins entities solely for scope; cross-table `project_id` is uniform across thoughts, labels, relationships, and chunks for a project; immutability invariant re-asserted

---

## Test Coverage Summary

**149 tests** across 6 test files, all green.

| Test File | Steps Covered | Focus |
|-----------|---------------|-------|
| `apps/api/test/database/schema/thought.schema.spec.ts` | 01-01 | Schema metadata: projectId column shape, index declaration |
| `apps/api/test/database/schema/label.schema.spec.ts` | 01-02 | Schema metadata: projectId column shape, index declaration |
| `apps/api/test/database/migrations/denormalize-project-id-backfill.spec.ts` | 01-03 | Property: backfilled subtype project_id equals owning entity project_id |
| `apps/api/test/workspace/thoughts/thoughts.service.spec.ts` | 02-01 | Property: create() stamps project_id; findByProject() returns only matching rows |
| `apps/api/test/workspace/labels/labels.service.spec.ts` | 02-02 | Property: create() stamps project_id; findByProject() returns only matching rows |
| `apps/api/test/workspace/project-scoping-consistency.spec.ts` | 03-01 | Property: cross-table uniformity, immutability, no entities scope-join |

**Testing approach**: property-based tests (fast-check) with state-delta invariants and `strict=true` throughout service specs. RED phase verified for all tests before GREEN implementation.

---

## Lessons Learned

1. **Schema migrations benefit from explicit ordering in acceptance criteria.** Specifying ADD nullable → backfill → SET NOT NULL → FK → INDEX in the roadmap criteria prevented ambiguity during implementation and made review straightforward.

2. **Source-text inspection is a valid architectural guard.** Asserting "no entities join for scope" via source code inspection catches structural regressions that behavior-only tests cannot. This pattern is reusable for other architectural invariants (e.g., "no direct DB access outside repositories").

3. **Static schema tests are legitimately exempt from PBT.** TypeScript schema definitions are configuration, not behavior. Forcing property-based tests on them adds noise without signal. The right test is "does the exported schema object have the expected shape" — a simple structural assertion.

4. **Mutation testing infrastructure should be provisioned at project setup, not mid-feature.** The absence of Stryker was discovered at delivery time. Installing it mid-delivery is disruptive. Recommendation: add `@stryker-mutator/core` and `@stryker-mutator/jest-runner` to devDependencies in a dedicated infrastructure sprint, targeting `src/workspace/thoughts/` and `src/workspace/labels/` with kill rate threshold ≥ 80%.

5. **Roadmap validation by the acceptance-designer-reviewer catches ordering issues early.** The reviewer's note on migration safety (and the non-blocking clarification requests on bypass:fallback rationale) improved criteria clarity before any code was written.

---

## Lasting Artifacts

No prior wave design artifacts exist for this feature (no DISCUSS, DESIGN, or DISTILL waves ran). This feature was planned directly via a 6-step roadmap created from the memory index entry.

**Source changes** (permanent, in git history):
- `apps/api/src/database/schema/thought.schema.ts`
- `apps/api/src/database/schema/label.schema.ts`
- `apps/api/drizzle/migrations/0001_denormalize_project_id.sql`
- `apps/api/src/workspace/thoughts/thoughts.service.ts`
- `apps/api/src/workspace/labels/labels.service.ts`
- `apps/api/test/database/schema/thought.schema.spec.ts`
- `apps/api/test/database/schema/label.schema.spec.ts`
- `apps/api/test/database/migrations/denormalize-project-id-backfill.spec.ts`
- `apps/api/test/workspace/thoughts/thoughts.service.spec.ts`
- `apps/api/test/workspace/labels/labels.service.spec.ts`
- `apps/api/test/workspace/project-scoping-consistency.spec.ts`

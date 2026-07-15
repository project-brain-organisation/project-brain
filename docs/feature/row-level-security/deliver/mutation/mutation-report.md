# Mutation Testing Report — row-level-security

**Feature**: row-level-security
**Date**: 2026-06-05
**Tool**: Stryker (TypeScript/JavaScript)
**Status**: SKIPPED — No mutation testing infrastructure configured

## Skip Justification

**Condition**: No mutation tool configured for this project

Stryker Mutator is not installed as a devDependency in `apps/api/package.json` and no
Stryker configuration file exists in the project. Installing Stryker mid-delivery is out
of scope for this feature (same condition as the delivered `denormalize-project-id` feature).

## Compensating Measures

The test suite provides high confidence via:

1. **205 tests** across 12 suites covering all 8 implementation steps (schema, migrations,
   role wiring, tenant context, RLS policies, cross-tenant isolation, ownership check slimming,
   plus adversarial-review revision).
2. **RED phase verification** — every test was authored in RED (observed failing for the right
   reason) before GREEN, confirming no vacuous tests.
3. **Adversarial review** (Phase 4) found 2 genuine BLOCKERs and a full revision pass was
   completed; implementation and tests verified correct.
4. **Cross-tenant integration test** (`test/integration/rls-cross-tenant.spec.ts`) authors 12
   assertions against the actual RLS policies — covers USING clause (read isolation) and
   WITH CHECK clause (write rejection) for all 5 RLS-protected tables.
5. **asUser() coverage** — all service DB operations call `DatabaseService.asUser(userId)`;
   test doubles spy on `asUser` to verify correct wiring without mocking away the behavior.
6. **TenantContextInterceptor** — ALS context propagation verified in
   `test/database/tenant-context.spec.ts` covering arbitrary userIds.

## Recommendation

Add `@stryker-mutator/core` and `@stryker-mutator/jest-runner` to devDependencies and a
`stryker.config.ts` targeting:
- `src/workspace/thoughts/thoughts.service.ts`
- `src/workspace/labels/labels.service.ts`
- `src/workspace/relationships/relationships.service.ts`
- `src/workspace/pipeline/pipeline.service.ts`
- `src/database/database.service.ts`

Run with kill rate threshold ≥ 80% against the workspace test suite. Priority mutants:
`asUser` call removal (would break RLS), `set_config` parameter tampering (would change
tenant context), owner_id stamp removal (would break RLS withCheck).

## Kill Rate

N/A — tool not installed

/**
 * Schema integration test: project_meta RLS enablement and policy declarations
 *
 * Scenario: "project_meta enables RLS with owner_isolation (for all) and
 * public_read (for select) policies via the 0.45.2 API"
 *
 * Verifies:
 * (a) project_meta has RLS enabled (Symbol.for('drizzle:EnableRLS') === true)
 * (b) policy 'project_meta_owner_isolation' is declared with for: 'all'
 * (c) policy 'project_meta_public_read' is declared with for: 'select'
 *
 * Introspection approach:
 * - RLS: table[Symbol.for('drizzle:EnableRLS')] === true (set by .enableRLS())
 * - Policies: resolve ExtraConfigBuilder(ExtraConfigColumns), filter PgPolicy instances
 *
 * EXEMPT FROM PBT PARADIGM (roadmap criterion 5): static schema metadata
 * introspection; behavioral cross-tenant proof is at step 03-03.
 */

import { projectMeta } from '../../src/database/schema/project-meta.schema';

type DrizzlePolicy = {
  name: string;
  for?: string;
  as?: string;
  to?: unknown;
};

function hasRlsEnabled(table: unknown): boolean {
  return (table as any)[Symbol.for('drizzle:EnableRLS')] === true;
}

function getPolicies(table: unknown): DrizzlePolicy[] {
  const buildFn = (table as any)[Symbol.for('drizzle:ExtraConfigBuilder')];
  const extraCols = (table as any)[Symbol.for('drizzle:ExtraConfigColumns')];
  if (!buildFn) return [];
  const config: unknown[] = buildFn(extraCols);
  if (!Array.isArray(config)) return [];
  return config.filter(
    (item): item is DrizzlePolicy =>
      item != null &&
      typeof item === 'object' &&
      (item as any).constructor?.name === 'PgPolicy',
  );
}

describe('project_meta RLS schema', () => {
  it('has RLS enabled on the table', () => {
    expect(hasRlsEnabled(projectMeta)).toBe(true);
  });

  it("declares policy 'project_meta_owner_isolation' for all operations", () => {
    const policies = getPolicies(projectMeta);
    const ownerIsolation = policies.find(
      (p) => p.name === 'project_meta_owner_isolation',
    );
    expect(ownerIsolation).toBeDefined();
    expect(ownerIsolation?.for).toBe('all');
  });

  it("declares policy 'project_meta_public_read' for select operations", () => {
    const policies = getPolicies(projectMeta);
    const publicRead = policies.find(
      (p) => p.name === 'project_meta_public_read',
    );
    expect(publicRead).toBeDefined();
    expect(publicRead?.for).toBe('select');
  });
});

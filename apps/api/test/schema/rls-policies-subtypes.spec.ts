/**
 * Schema integration test: RLS enablement and owner_isolation policy declarations
 * for the four subtype tables — thoughts, labels, relationships, chunks.
 *
 * Scenario: "thoughts, labels, relationships, and chunks enable RLS with
 * owner_isolation policies keyed on local owner_id"
 *
 * Verifies for each table:
 * (a) RLS enabled (Symbol.for('drizzle:EnableRLS') === true)
 * (b) policy '<table>_owner_isolation' declared with for: 'all'
 *
 * Introspection mirrors rls-policies-project-meta.spec.ts (step 03-01).
 *
 * EXEMPT FROM PBT PARADIGM (roadmap criterion 5): static schema metadata
 * introspection; behavioral cross-tenant proof is at step 03-03.
 */

import { thoughts } from '../../src/database/schema/thought.schema';
import { labels } from '../../src/database/schema/label.schema';
import { relationships } from '../../src/database/schema/relationship.schema';
import { chunks } from '../../src/database/schema/chunk.schema';

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

const tableFixtures = [
  { label: 'thoughts', table: thoughts, policyName: 'thoughts_owner_isolation' },
  { label: 'labels', table: labels, policyName: 'labels_owner_isolation' },
  { label: 'relationships', table: relationships, policyName: 'relationships_owner_isolation' },
  { label: 'chunks', table: chunks, policyName: 'chunks_owner_isolation' },
];

describe.each(tableFixtures)(
  'RLS schema for $label',
  ({ table, policyName, label }) => {
    it(`has RLS enabled on the ${label} table`, () => {
      expect(hasRlsEnabled(table)).toBe(true);
    });

    it(`declares policy '${policyName}' for all operations`, () => {
      const policies = getPolicies(table);
      const ownerIsolation = policies.find((p) => p.name === policyName);
      expect(ownerIsolation).toBeDefined();
      expect(ownerIsolation?.for).toBe('all');
    });
  },
);

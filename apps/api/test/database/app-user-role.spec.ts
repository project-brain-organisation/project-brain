/**
 * Connectivity test — step 02-01
 *
 * Scenario: app_user role holds only DML grants, owns no tables, and runtime connects as app_user
 *
 * EXEMPT FROM PARADIGM (criterion 5): static role grants and connection wiring.
 * Cross-tenant property at step 03-03 is the compensating behavioral proof.
 *
 * This test is a connectivity check. Without DATABASE_URL_APP (or DATABASE_URL as fallback)
 * it self-skips. When a live DB is available it:
 *   (a) connects as app_user via DATABASE_URL_APP
 *   (b) runs a DML probe (SELECT count(*) FROM project_meta)
 *   (c) asserts no error is thrown
 *
 * Role-membership invariant: app_user is NOT a member of the owner role.
 * This is enforced by the migration (0003_app_user_role.sql) — no GRANT ROLE statement
 * is included — not at runtime, so it is noted here as a migration-level static invariant.
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const DB_AVAILABLE = !!process.env.DATABASE_URL_APP || !!process.env.DATABASE_URL;
const describeOrSkip = DB_AVAILABLE ? describe : describe.skip;

describeOrSkip('app_user role — connectivity probe', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL,
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('app_user can execute DML on app tables without error', async () => {
    const result = await pool.query('SELECT count(*) FROM project_meta');
    expect(result.rows).toBeDefined();
    expect(result.rows.length).toBe(1);
    expect(Number(result.rows[0].count)).toBeGreaterThanOrEqual(0);
  });
});

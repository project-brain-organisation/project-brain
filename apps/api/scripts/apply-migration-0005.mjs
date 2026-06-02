import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const text = readFileSync(new URL('../drizzle/migrations/0005_mcp_auth_hardening.sql', import.meta.url), 'utf8');
const statements = text.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);

for (const stmt of statements) {
  console.log('>', stmt.split('\n')[0]);
  await sql.query(stmt);
}
console.log('migration 0005 applied');

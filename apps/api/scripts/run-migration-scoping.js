const path = require('path');
const fs = require('fs');
// Walk up from scripts/ to find the root .env
let dir = __dirname;
while (dir !== path.dirname(dir)) {
  const envPath = path.join(dir, '.env');
  if (require('fs').existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    break;
  }
  dir = path.dirname(dir);
}
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);
const migrationPath = path.resolve(__dirname, '..', 'drizzle', 'migrations', '0004_add_scoping_columns.sql');
const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

// Split on semicolons but keep DO $$ blocks intact
function splitStatements(text) {
  const statements = [];
  let current = '';
  let inDollarBlock = false;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--') || trimmed === '') {
      current += line + '\n';
      continue;
    }
    if (trimmed.startsWith('DO $$')) inDollarBlock = true;
    if (trimmed === 'END $$;') inDollarBlock = false;

    current += line + '\n';

    if (!inDollarBlock && trimmed.endsWith(';')) {
      // Strip leading blank/comment lines
      const stmt = current.trim().replace(/^(--.*\n|\s*\n)*/g, '').trim();
      if (stmt) statements.push(stmt);
      current = '';
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

async function run() {
  const statements = splitStatements(migrationSql);
  for (const stmt of statements) {
    const preview = stmt.substring(0, 80).replace(/\n/g, ' ');
    console.log(`Running: ${preview}...`);
    await sql.query(stmt);
    console.log('  OK');
  }
  console.log('\nMigration 0004 applied successfully.');
}

run().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});

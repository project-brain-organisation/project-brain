require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

sql`ALTER TABLE "labels" ADD COLUMN IF NOT EXISTS "is_edge" boolean NOT NULL DEFAULT false`
  .then(() => {
    console.log('Migration applied successfully: added is_edge column to labels');
    process.exit(0);
  })
  .catch((e) => {
    console.error('Migration failed:', e.message);
    process.exit(1);
  });

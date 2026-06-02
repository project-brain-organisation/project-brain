require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

(async () => {
  await sql`CREATE TABLE IF NOT EXISTS colors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    hex varchar(7) NOT NULL,
    created_at timestamp DEFAULT now() NOT NULL
  )`;
  console.log('Created colors table');

  await sql`ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS color_id uuid`;
  console.log('Added color_id column');

  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'colors_user_id_users_id_fk') THEN
      ALTER TABLE colors ADD CONSTRAINT colors_user_id_users_id_fk
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade;
    END IF;
  END $$`;
  console.log('Added colors FK');

  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'thoughts_color_id_colors_id_fk') THEN
      ALTER TABLE thoughts ADD CONSTRAINT thoughts_color_id_colors_id_fk
        FOREIGN KEY (color_id) REFERENCES colors(id) ON DELETE set null;
    END IF;
  END $$`;
  console.log('Added thoughts FK');

  await sql`CREATE INDEX IF NOT EXISTS idx_colors_user_id ON colors USING btree (user_id)`;
  console.log('Created index');

  console.log('Migration complete');
  process.exit(0);
})().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});

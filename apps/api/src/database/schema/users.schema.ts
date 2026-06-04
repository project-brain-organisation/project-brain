/**
 * users.schema.ts — minimal stub for FK references
 * Fleshed out in step 01-04.
 */
import { pgTable, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
});

/**
 * app-user-role.schema.ts — declares app_user as an existing Postgres role
 *
 * Using createRole: false tells drizzle-kit the role already exists in the
 * database (created by migration 0003_app_user_role.sql) and must not be
 * re-created on each `drizzle-kit push`. The exported symbol is included in
 * the schema barrel so drizzle-kit sees and references it.
 */
import { pgRole } from 'drizzle-orm/pg-core';

export const appUser = pgRole('app_user', { createRole: false });

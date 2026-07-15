/**
 * schema/index.ts — barrel re-exporting all table definitions
 *
 * All consumers (DatabaseService, drizzle.config.ts, tests) import from
 * this single entry point rather than individual schema files.
 */
export * from './entities.schema';
export * from './project-meta.schema';
export * from './project-subscription.schema';
export * from './users.schema';
export * from './thought.schema';
export * from './label.schema';
export * from './relationship.schema';
export * from './chunk.schema';
export * from './mcp-tokens.schema';
export * from './app-user-role.schema';

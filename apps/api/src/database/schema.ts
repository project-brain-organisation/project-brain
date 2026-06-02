import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  integer,
  boolean,
  index,
  unique,
  customType,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ── Custom pgvector type ─────────────────────────────────────────
const vector = customType<{ data: number[] }>({
  dataType() {
    return 'vector(768)';
  },
  toDriver(value: number[]) {
    return JSON.stringify(value);
  },
  fromDriver(value: unknown) {
    return value as number[];
  },
});

// ── Tables ───────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const credentials = pgTable(
  'credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 50 }).notNull(),
    providerId: varchar('provider_id', { length: 255 }).notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    tokenExpiresAt: timestamp('token_expires_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [unique('uq_provider_provider_id').on(t.provider, t.providerId)],
);

export const colors = pgTable(
  'colors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    hex: varchar('hex', { length: 7 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('idx_colors_user_id').on(t.userId)],
);

export const thoughts = pgTable(
  'thoughts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id'),
    parentId: uuid('parent_id').references((): any => thoughts.id, {
      onDelete: 'set null',
    }),
    colorId: uuid('color_id').references(() => colors.id, {
      onDelete: 'set null',
    }),
    isRoot: boolean('is_root').notNull().default(false),
    body: text('body').notNull().default(''),
    title: varchar('title', { length: 255 }).notNull().default(''),
    contentHash: varchar('content_hash', { length: 64 }),
    canvasX: integer('canvas_x'),
    canvasY: integer('canvas_y'),
    width: integer('width'),
    height: integer('height'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_thoughts_user_id').on(t.userId),
    index('idx_thoughts_project_id').on(t.projectId),
    index('idx_thoughts_content_hash').on(t.userId, t.contentHash),
    index('idx_thoughts_parent_id').on(t.parentId),
  ],
);

export const chunks = pgTable(
  'chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' }),
    thoughtId: uuid('thought_id')
      .notNull()
      .references(() => thoughts.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    chunkIndex: integer('chunk_index').notNull(),
    vectorEmbedding: vector('vector_embedding'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_chunks_thought_id').on(t.thoughtId),
    index('idx_chunks_user_id').on(t.userId),
  ],
);

export const mcpAuthCodes = pgTable(
  'mcp_auth_codes',
  {
    code: varchar('code', { length: 64 }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: varchar('client_id', { length: 255 }).notNull(),
    codeChallenge: varchar('code_challenge', { length: 128 }),
    codeChallengeMethod: varchar('code_challenge_method', { length: 10 }).default(
      'S256',
    ),
    redirectUri: text('redirect_uri').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    used: boolean('used').notNull().default(false),
    consumedAt: timestamp('consumed_at'),
  },
  (t) => [
    index('idx_mcp_auth_codes_expires_at').on(t.expiresAt),
    index('idx_mcp_auth_codes_user_client').on(t.userId, t.clientId),
  ],
);

export const mcpRefreshTokens = pgTable(
  'mcp_refresh_tokens',
  {
    token: varchar('token', { length: 64 }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: varchar('client_id', { length: 255 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    revoked: boolean('revoked').notNull().default(false),
    rotatedFrom: varchar('rotated_from', { length: 64 }),
  },
  (t) => [
    index('idx_mcp_refresh_tokens_expires_at').on(t.expiresAt),
    index('idx_mcp_refresh_tokens_user_client').on(t.userId, t.clientId),
  ],
);

export const labels = pgTable(
  'labels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .references(() => thoughts.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    color: varchar('color', { length: 7 }).notNull().default('#999999'),
    isEdge: boolean('is_edge').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_labels_user_id').on(t.userId),
    index('idx_labels_project_id').on(t.projectId),
  ],
);

export const thoughtLabels = pgTable(
  'thought_labels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' }),
    thoughtId: uuid('thought_id')
      .notNull()
      .references(() => thoughts.id, { onDelete: 'cascade' }),
    labelId: uuid('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_thought_labels_thought_id').on(t.thoughtId),
    index('idx_thought_labels_label_id').on(t.labelId),
    index('idx_thought_labels_user_id').on(t.userId),
  ],
);

// ── Relations ────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  credentials: many(credentials),
  thoughts: many(thoughts),
}));

export const credentialsRelations = relations(credentials, ({ one }) => ({
  user: one(users, { fields: [credentials.userId], references: [users.id] }),
}));

export const thoughtsRelations = relations(thoughts, ({ one, many }) => ({
  user: one(users, { fields: [thoughts.userId], references: [users.id] }),
  parent: one(thoughts, { fields: [thoughts.parentId], references: [thoughts.id] }),
  children: many(thoughts),
  chunks: many(chunks),
  thoughtLabels: many(thoughtLabels),
}));

export const chunksRelations = relations(chunks, ({ one }) => ({
  thought: one(thoughts, { fields: [chunks.thoughtId], references: [thoughts.id] }),
}));

export const labelsRelations = relations(labels, ({ one, many }) => ({
  user: one(users, { fields: [labels.userId], references: [users.id] }),
  thoughtLabels: many(thoughtLabels),
}));

export const thoughtLabelsRelations = relations(thoughtLabels, ({ one }) => ({
  thought: one(thoughts, { fields: [thoughtLabels.thoughtId], references: [thoughts.id] }),
  label: one(labels, { fields: [thoughtLabels.labelId], references: [labels.id] }),
}));

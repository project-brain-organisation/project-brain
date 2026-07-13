/**
 * thought.schema.ts — Layer 1 request schema for creating a thought.
 *
 * A thought spans TWO tables in the Table-per-Type model (§3): the `entities`
 * supertype (which carries projectId) and the `thoughts` subtype (body, title,
 * color, canvas geometry). The request schema is therefore COMPOSED from both
 * inferred drizzle-zod schemas rather than a single raw insert schema.
 *
 * Layer 1 is intrinsic/stateless ONLY — no DB lookups for ownership/existence.
 * Those belong in ThoughtsService (already implemented in step 03-01).
 */
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { entities } from '../../database/schema/entities.schema';
import { thoughts } from '../../database/schema/thought.schema';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

// Inferred building blocks (single source of truth = the Drizzle table defs).
const entityInsert = createInsertSchema(entities);
const thoughtInsert = createInsertSchema(thoughts);

export const createThoughtSchema = z
  .object({
    // projectId is the entities-table scoping column, required on create.
    projectId: entityInsert.shape.projectId,
    // body lives on the thoughts subtype. Empty is allowed — the UI creates a
    // blank card first and the user types into it (column defaults to '').
    body: z.string().trim().max(50_000),
  })
  .extend({
    // Optional client-generated id — lets the UI insert optimistically and
    // reference the thought before the request resolves. Duplicate → 409.
    id: z.string().uuid().optional(),
    // Optional parent thought: creates the hierarchy relationship in the same
    // transaction (one round trip, no half-created state).
    parentId: z.string().uuid().optional(),
    title: thoughtInsert.shape.title.optional(),
    color: z
      .string()
      .regex(HEX_COLOR, 'color must match #RRGGBB')
      .optional(),
    canvasX: thoughtInsert.shape.canvasX.optional(),
    canvasY: thoughtInsert.shape.canvasY.optional(),
    width: thoughtInsert.shape.width.optional(),
    height: thoughtInsert.shape.height.optional(),
  })
  .strict();

export type CreateThoughtRequest = z.infer<typeof createThoughtSchema>;

export const updateThoughtSchema = z
  .object({
    body: z.string().trim().max(50_000).optional(),
    title: thoughtInsert.shape.title.optional(),
    canvasX: thoughtInsert.shape.canvasX.optional(),
    canvasY: thoughtInsert.shape.canvasY.optional(),
    width: thoughtInsert.shape.width.optional(),
    height: thoughtInsert.shape.height.optional(),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'at least one field is required',
  });

export type UpdateThoughtRequest = z.infer<typeof updateThoughtSchema>;

export const setThoughtColorSchema = z
  .object({
    color: z.string().regex(HEX_COLOR, 'color must match #RRGGBB'),
  })
  .strict();

export type SetThoughtColorRequest = z.infer<typeof setThoughtColorSchema>;

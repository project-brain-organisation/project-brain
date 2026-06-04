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
    // body lives on the thoughts subtype; require a non-empty trimmed value.
    body: z.string().trim().min(1).max(50_000),
  })
  .extend({
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

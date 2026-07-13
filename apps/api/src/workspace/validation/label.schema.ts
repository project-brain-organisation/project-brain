/**
 * label.schema.ts — Layer 1 request schema for creating a label.
 *
 * A label spans `entities` (projectId scope) + `labels` (name, color, isEdge).
 * Composed from both inferred drizzle-zod schemas. Stateless Layer-1 rules only.
 */
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { entities } from '../../database/schema/entities.schema';
import { labels } from '../../database/schema/label.schema';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const entityInsert = createInsertSchema(entities);
const labelInsert = createInsertSchema(labels);

export const createLabelSchema = z
  .object({
    // Optional client-generated id (optimistic UI inserts). Duplicate → 409.
    id: z.string().uuid().optional(),
    projectId: entityInsert.shape.projectId,
    name: z.string().trim().min(1).max(100),
  })
  .extend({
    color: z
      .string()
      .regex(HEX_COLOR, 'color must match #RRGGBB')
      .optional(),
    isEdge: labelInsert.shape.isEdge.optional(),
  })
  .strict();

export type CreateLabelRequest = z.infer<typeof createLabelSchema>;

export const updateLabelSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    color: z
      .string()
      .regex(HEX_COLOR, 'color must match #RRGGBB')
      .optional(),
    isEdge: labelInsert.shape.isEdge.optional(),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'at least one field is required',
  });

export type UpdateLabelRequest = z.infer<typeof updateLabelSchema>;

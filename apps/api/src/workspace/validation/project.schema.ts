/**
 * project.schema.ts — Layer 1 request schema for creating a project.
 *
 * A project spans `entities` (type='project') + `project_meta` (name, emoji,
 * isPublic). ownerId is derived from the authenticated user in the service, NOT
 * from the request body, so it is intentionally absent here. Stateless rules only.
 */
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { projectMeta } from '../../database/schema/project-meta.schema';

const projectInsert = createInsertSchema(projectMeta);

export const createProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
  })
  .extend({
    // emoji is a nullable column; the request accepts a short string or omission,
    // never an explicit null — so use a non-null optional string here.
    emoji: z.string().trim().max(16).optional(),
    isPublic: projectInsert.shape.isPublic.optional(),
  })
  .strict();

export type CreateProjectRequest = z.infer<typeof createProjectSchema>;

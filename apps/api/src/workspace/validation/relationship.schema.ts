/**
 * relationship.schema.ts — Layer 1 request schema for creating a relationship.
 *
 * Stateless rules only:
 *   - kind ∈ { hierarchy, tag, edge } (enum from the Drizzle table)
 *   - source_id !== target_id (.refine — no self-edges)
 *   - label_id is shape-permitted on kind='edge' ONLY; rejected for hierarchy/tag
 *
 * Endpoint-TYPE checks (tag target must be a label, hierarchy needs thought/thought,
 * cross-project rejection) are STATEFUL and live in RelationshipsService (03-03),
 * NOT here.
 */
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { relationships } from '../../database/schema/relationship.schema';

const relationshipInsert = createInsertSchema(relationships);

export const createRelationshipSchema = z
  .object({
    projectId: relationshipInsert.shape.projectId,
    sourceId: relationshipInsert.shape.sourceId,
    targetId: relationshipInsert.shape.targetId,
    kind: relationshipInsert.shape.kind,
    // labelId is a nullable column; the request layer accepts present-or-absent
    // (a uuid or omitted), never an explicit null — so unwrap nullability here.
    labelId: relationshipInsert.shape.sourceId.optional(),
  })
  .strict()
  .refine((value) => value.sourceId !== value.targetId, {
    message: 'sourceId and targetId must differ (no self-relationship)',
    path: ['targetId'],
  })
  .refine((value) => value.labelId === undefined || value.kind === 'edge', {
    message: "labelId is only permitted when kind is 'edge'",
    path: ['labelId'],
  });

export type CreateRelationshipRequest = z.infer<typeof createRelationshipSchema>;

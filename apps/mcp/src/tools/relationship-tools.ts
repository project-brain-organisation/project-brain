import { z } from 'zod/v4';
import { defineTool, type ApiResult, type ToolDefinition } from './tool-contract.js';

export interface CreateRelationshipDeps {
  createRelationship: (
    userId: string,
    params: { projectId: string; sourceId: string; targetId: string; labelId: string },
    scope?: string,
  ) => Promise<ApiResult>;
}

export function createCreateRelationshipTool(deps: CreateRelationshipDeps): ToolDefinition {
  return defineTool({
    name: 'create_relationship',
    description:
      'Create a directional, labelled relationship between two thoughts (source → target). ' +
      'labelId must be an edge label (isEdge = true — see list_labels, or promote one with set_label_edge). ' +
      'Rendered as an arrowed edge in the knowledge-graph view.',
    schema: z.object({
      projectId: z.string().uuid(),
      sourceId: z.string().uuid(),
      targetId: z.string().uuid(),
      labelId: z.string().uuid(),
    }),
    execute: (ctx, args) => deps.createRelationship(ctx.userId, args, ctx.scope),
  });
}

export interface ListRelationshipsDeps {
  listRelationships: (
    userId: string,
    params: { projectId: string; kind?: 'hierarchy' | 'tag' | 'edge' },
    scope?: string,
  ) => Promise<ApiResult>;
}

export function createListRelationshipsTool(deps: ListRelationshipsDeps): ToolDefinition {
  return defineTool({
    name: 'list_relationships',
    description:
      'List relationships in a project. kind filters to hierarchy (parent/child), ' +
      'tag (thought→label), or edge (directional labelled thought→thought).',
    schema: z.object({
      projectId: z.string().uuid(),
      kind: z.enum(['hierarchy', 'tag', 'edge']).optional(),
    }),
    execute: (ctx, args) => deps.listRelationships(ctx.userId, args, ctx.scope),
  });
}

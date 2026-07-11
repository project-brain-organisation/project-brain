import { z } from 'zod';
import type { ApiResult, ToolDefinition } from './tool-contract.js';

const schema = z.object({
  query: z.string().min(1),
  n: z.number().int().min(1).max(20).default(5),
  projectId: z.string().uuid().optional(),
});

export interface RememberDeps {
  remember: (
    userId: string,
    query: string,
    n: number,
    projectId?: string,
    scope?: string,
  ) => Promise<ApiResult>;
}

export function createRememberTool(deps: RememberDeps): ToolDefinition {
  return {
    name: 'remember',
    description: 'Search the knowledge base by semantic similarity',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        n: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
        projectId: {
          type: 'string',
          format: 'uuid',
          description: 'Optional: restrict the search to one project',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    parseArguments: (args) => schema.parse(args),
    execute: (context, args) => {
      const { query, n, projectId } = args as z.infer<typeof schema>;
      return deps.remember(context.userId, query, n, projectId, context.scope);
    },
  };
}

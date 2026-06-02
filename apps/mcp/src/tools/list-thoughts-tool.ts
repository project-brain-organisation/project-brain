import { z } from 'zod';
import type { ApiResult, ToolDefinition } from './tool-contract.js';

const schema = z.object({
  parentId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
});

export interface ListThoughtsDeps {
  listThoughts: (
    userId: string,
    params: { parentId?: string; projectId?: string },
    scope?: string,
  ) => Promise<ApiResult>;
}

export function createListThoughtsTool(deps: ListThoughtsDeps): ToolDefinition {
  return {
    name: 'list_thoughts',
    description: 'List thoughts, optionally filtered by parent or project',
    inputSchema: {
      type: 'object',
      properties: {
        parentId: { type: 'string', format: 'uuid' },
        projectId: { type: 'string', format: 'uuid' },
      },
      additionalProperties: false,
    },
    parseArguments: (args) => schema.parse(args),
    execute: (context, args) => {
      const parsedArgs = args as z.infer<typeof schema>;
      return deps.listThoughts(context.userId, parsedArgs, context.scope);
    },
  };
}

import { z } from 'zod';
import type { ApiResult, ToolDefinition } from './tool-contract.js';

const schema = z.object({
  projectId: z.string().uuid(),
});

export interface ListThoughtsDeps {
  listThoughts: (
    userId: string,
    params: { projectId: string },
    scope?: string,
  ) => Promise<ApiResult>;
}

export function createListThoughtsTool(deps: ListThoughtsDeps): ToolDefinition {
  return {
    name: 'list_thoughts',
    description: 'List all thoughts in a project',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', format: 'uuid' },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    parseArguments: (args) => schema.parse(args),
    execute: (context, args) => {
      const parsedArgs = args as z.infer<typeof schema>;
      return deps.listThoughts(context.userId, parsedArgs, context.scope);
    },
  };
}

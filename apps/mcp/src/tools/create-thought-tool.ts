import { z } from 'zod';
import type { ApiResult, ToolDefinition } from './tool-contract.js';

const schema = z.object({
  body: z.string().min(1),
  title: z.string().optional(),
  projectId: z.string().uuid(),
});

export interface CreateThoughtDeps {
  createThought: (
    userId: string,
    params: { body: string; title?: string; projectId: string },
    scope?: string,
  ) => Promise<ApiResult>;
}

export function createCreateThoughtTool(deps: CreateThoughtDeps): ToolDefinition {
  return {
    name: 'create_thought',
    description: 'Create a new thought in a project',
    inputSchema: {
      type: 'object',
      properties: {
        body: { type: 'string' },
        title: { type: 'string' },
        projectId: { type: 'string', format: 'uuid' },
      },
      required: ['body', 'projectId'],
      additionalProperties: false,
    },
    parseArguments: (args) => schema.parse(args),
    execute: (context, args) => {
      const parsedArgs = args as z.infer<typeof schema>;
      return deps.createThought(context.userId, parsedArgs, context.scope);
    },
  };
}

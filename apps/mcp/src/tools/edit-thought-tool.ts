import { z } from 'zod';
import type { ApiResult, ToolDefinition } from './tool-contract.js';

const schema = z.object({
  thoughtId: z.string().uuid(),
  body: z.string().optional(),
  title: z.string().optional(),
  parentId: z.string().uuid().optional(),
});

export interface EditThoughtDeps {
  editThought: (
    userId: string,
    params: { thoughtId: string; body?: string; title?: string; parentId?: string },
    scope?: string,
  ) => Promise<ApiResult>;
}

export function createEditThoughtTool(deps: EditThoughtDeps): ToolDefinition {
  return {
    name: 'edit_thought',
    description: 'Update an existing thought',
    inputSchema: {
      type: 'object',
      properties: {
        thoughtId: { type: 'string', format: 'uuid' },
        body: { type: 'string' },
        title: { type: 'string' },
        parentId: { type: 'string', format: 'uuid' },
      },
      required: ['thoughtId'],
      additionalProperties: false,
    },
    parseArguments: (args) => schema.parse(args),
    execute: (context, args) => {
      const parsedArgs = args as z.infer<typeof schema>;
      return deps.editThought(context.userId, parsedArgs, context.scope);
    },
  };
}

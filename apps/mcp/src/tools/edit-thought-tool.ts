import { z } from 'zod';
import type { ApiResult, ToolDefinition } from './tool-contract.js';

const schema = z.object({
  thoughtId: z.string().uuid(),
  body: z.string().min(1),
});

export interface EditThoughtDeps {
  editThought: (
    userId: string,
    params: { thoughtId: string; body: string },
    scope?: string,
  ) => Promise<ApiResult>;
}

export function createEditThoughtTool(deps: EditThoughtDeps): ToolDefinition {
  return {
    name: 'edit_thought',
    description: 'Replace the body of an existing thought (re-chunks and re-embeds it)',
    inputSchema: {
      type: 'object',
      properties: {
        thoughtId: { type: 'string', format: 'uuid' },
        body: { type: 'string' },
      },
      required: ['thoughtId', 'body'],
      additionalProperties: false,
    },
    parseArguments: (args) => schema.parse(args),
    execute: (context, args) => {
      const parsedArgs = args as z.infer<typeof schema>;
      return deps.editThought(context.userId, parsedArgs, context.scope);
    },
  };
}

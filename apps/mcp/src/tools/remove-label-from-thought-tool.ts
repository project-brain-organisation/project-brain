import { z } from 'zod';
import type { ApiResult, ToolDefinition } from './tool-contract.js';

const schema = z.object({
  thoughtId: z.string().uuid(),
  labelId: z.string().uuid(),
});

export interface RemoveLabelFromThoughtDeps {
  removeLabelFromThought: (
    userId: string,
    params: { thoughtId: string; labelId: string },
    scope?: string,
  ) => Promise<ApiResult>;
}

export function createRemoveLabelFromThoughtTool(deps: RemoveLabelFromThoughtDeps): ToolDefinition {
  return {
    name: 'remove_label_from_thought',
    description: 'Remove a label from a thought',
    inputSchema: {
      type: 'object',
      properties: {
        thoughtId: { type: 'string', format: 'uuid' },
        labelId: { type: 'string', format: 'uuid' },
      },
      required: ['thoughtId', 'labelId'],
      additionalProperties: false,
    },
    parseArguments: (args) => schema.parse(args),
    execute: (context, args) => {
      const parsedArgs = args as z.infer<typeof schema>;
      return deps.removeLabelFromThought(context.userId, parsedArgs, context.scope);
    },
  };
}

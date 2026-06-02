import { z } from 'zod';
import type { ApiResult, ToolDefinition } from './tool-contract.js';

const schema = z.object({
  thoughtId: z.string().uuid(),
});

export interface RemoveThoughtDeps {
  removeThought: (userId: string, thoughtId: string, scope?: string) => Promise<ApiResult>;
}

export function createRemoveThoughtTool(deps: RemoveThoughtDeps): ToolDefinition {
  return {
    name: 'remove_thought',
    description: 'Delete a thought',
    inputSchema: {
      type: 'object',
      properties: {
        thoughtId: { type: 'string', format: 'uuid' },
      },
      required: ['thoughtId'],
      additionalProperties: false,
    },
    parseArguments: (args) => schema.parse(args),
    execute: (context, args) => {
      const { thoughtId } = args as z.infer<typeof schema>;
      return deps.removeThought(context.userId, thoughtId, context.scope);
    },
  };
}

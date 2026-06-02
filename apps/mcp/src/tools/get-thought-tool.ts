import { z } from 'zod';
import type { ApiResult, ToolDefinition } from './tool-contract.js';

const schema = z.object({
  thoughtId: z.string().uuid(),
});

export interface GetThoughtDeps {
  getThought: (userId: string, thoughtId: string, scope?: string) => Promise<ApiResult>;
}

export function createGetThoughtTool(deps: GetThoughtDeps): ToolDefinition {
  return {
    name: 'get_thought',
    description: 'Get a single thought by ID',
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
      return deps.getThought(context.userId, thoughtId, context.scope);
    },
  };
}

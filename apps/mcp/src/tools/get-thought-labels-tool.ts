import { z } from 'zod';
import type { ApiResult, ToolDefinition } from './tool-contract.js';

const schema = z.object({
  thoughtId: z.string().uuid(),
});

export interface GetThoughtLabelsDeps {
  getThoughtLabels: (userId: string, thoughtId: string, scope?: string) => Promise<ApiResult>;
}

export function createGetThoughtLabelsTool(deps: GetThoughtLabelsDeps): ToolDefinition {
  return {
    name: 'get_thought_labels',
    description: 'Get all labels on a thought',
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
      return deps.getThoughtLabels(context.userId, thoughtId, context.scope);
    },
  };
}

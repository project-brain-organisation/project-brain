import { z } from 'zod';
import type { ApiResult, ToolDefinition } from './tool-contract.js';

const schema = z.object({
  thoughtId: z.string().uuid(),
});

export interface ClearThoughtColorDeps {
  clearThoughtColor: (userId: string, thoughtId: string, scope?: string) => Promise<ApiResult>;
}

export function createClearThoughtColorTool(deps: ClearThoughtColorDeps): ToolDefinition {
  return {
    name: 'clear_thought_color',
    description: 'Remove the color from a thought',
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
      return deps.clearThoughtColor(context.userId, thoughtId, context.scope);
    },
  };
}

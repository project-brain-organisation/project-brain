import { z } from 'zod';
import type { ApiResult, ToolDefinition } from './tool-contract.js';

const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;

const schema = z.object({
  thoughtId: z.string().uuid(),
  hex: z.string().regex(hexColorRegex),
});

export interface SetThoughtColorDeps {
  setThoughtColor: (userId: string, thoughtId: string, hex: string, scope?: string) => Promise<ApiResult>;
}

export function createSetThoughtColorTool(deps: SetThoughtColorDeps): ToolDefinition {
  return {
    name: 'set_thought_color',
    description: 'Set the color of a thought',
    inputSchema: {
      type: 'object',
      properties: {
        thoughtId: { type: 'string', format: 'uuid' },
        hex: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
      },
      required: ['thoughtId', 'hex'],
      additionalProperties: false,
    },
    parseArguments: (args) => schema.parse(args),
    execute: (context, args) => {
      const { thoughtId, hex } = args as z.infer<typeof schema>;
      return deps.setThoughtColor(context.userId, thoughtId, hex, context.scope);
    },
  };
}

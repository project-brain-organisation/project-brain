import { z } from 'zod';
import type { ApiResult, ToolDefinition } from './tool-contract.js';

const schema = z.object({
  labelId: z.string().uuid(),
});

export interface RemoveLabelDeps {
  removeLabel: (userId: string, labelId: string, scope?: string) => Promise<ApiResult>;
}

export function createRemoveLabelTool(deps: RemoveLabelDeps): ToolDefinition {
  return {
    name: 'remove_label',
    description: 'Delete a label',
    inputSchema: {
      type: 'object',
      properties: {
        labelId: { type: 'string', format: 'uuid' },
      },
      required: ['labelId'],
      additionalProperties: false,
    },
    parseArguments: (args) => schema.parse(args),
    execute: (context, args) => {
      const { labelId } = args as z.infer<typeof schema>;
      return deps.removeLabel(context.userId, labelId, context.scope);
    },
  };
}

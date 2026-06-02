import { z } from 'zod';
import type { ApiResult, ToolDefinition } from './tool-contract.js';

const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;

const schema = z.object({
  labelId: z.string().uuid(),
  name: z.string().min(1).optional(),
  color: z.string().regex(hexColorRegex).optional(),
  isEdge: z.boolean().optional(),
});

export interface UpdateLabelDeps {
  updateLabel: (
    userId: string,
    params: { labelId: string; name?: string; color?: string; isEdge?: boolean },
    scope?: string,
  ) => Promise<ApiResult>;
}

export function createUpdateLabelTool(deps: UpdateLabelDeps): ToolDefinition {
  return {
    name: 'update_label',
    description: 'Update a label',
    inputSchema: {
      type: 'object',
      properties: {
        labelId: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
        isEdge: { type: 'boolean' },
      },
      required: ['labelId'],
      additionalProperties: false,
    },
    parseArguments: (args) => schema.parse(args),
    execute: (context, args) => {
      const parsedArgs = args as z.infer<typeof schema>;
      return deps.updateLabel(context.userId, parsedArgs, context.scope);
    },
  };
}

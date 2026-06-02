import { z } from 'zod';
import type { ApiResult, ToolDefinition } from './tool-contract.js';

const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;

const schema = z.object({
  name: z.string().min(1),
  color: z.string().regex(hexColorRegex).optional(),
  projectId: z.string().uuid().optional(),
});

export interface CreateLabelDeps {
  createLabel: (
    userId: string,
    params: { name: string; color?: string; projectId?: string },
    scope?: string,
  ) => Promise<ApiResult>;
}

export function createCreateLabelTool(deps: CreateLabelDeps): ToolDefinition {
  return {
    name: 'create_label',
    description: 'Create a new label',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
        projectId: { type: 'string', format: 'uuid' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    parseArguments: (args) => schema.parse(args),
    execute: (context, args) => {
      const parsedArgs = args as z.infer<typeof schema>;
      return deps.createLabel(context.userId, parsedArgs, context.scope);
    },
  };
}

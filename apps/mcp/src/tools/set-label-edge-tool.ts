import { z } from 'zod';
import type { ApiResult, ToolDefinition } from './tool-contract.js';

const schema = z.object({
  labelId: z.string().uuid(),
  isEdge: z.boolean(),
});

export interface SetLabelEdgeDeps {
  setLabelEdge: (userId: string, labelId: string, isEdge: boolean, scope?: string) => Promise<ApiResult>;
}

export function createSetLabelEdgeTool(deps: SetLabelEdgeDeps): ToolDefinition {
  return {
    name: 'set_label_edge',
    description: 'Promote/demote a label as a graph edge',
    inputSchema: {
      type: 'object',
      properties: {
        labelId: { type: 'string', format: 'uuid' },
        isEdge: { type: 'boolean' },
      },
      required: ['labelId', 'isEdge'],
      additionalProperties: false,
    },
    parseArguments: (args) => schema.parse(args),
    execute: (context, args) => {
      const { labelId, isEdge } = args as z.infer<typeof schema>;
      return deps.setLabelEdge(context.userId, labelId, isEdge, context.scope);
    },
  };
}

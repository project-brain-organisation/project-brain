import { z } from 'zod';
import type { ApiResult, ToolDefinition } from './tool-contract.js';

const schema = z.object({
  thoughtId: z.string().uuid(),
  labelId: z.string().uuid(),
  projectId: z.string().uuid(),
});

export interface AddLabelToThoughtDeps {
  addLabelToThought: (
    userId: string,
    params: { thoughtId: string; labelId: string; projectId: string },
    scope?: string,
  ) => Promise<ApiResult>;
}

export function createAddLabelToThoughtTool(deps: AddLabelToThoughtDeps): ToolDefinition {
  return {
    name: 'add_label_to_thought',
    description: 'Assign a label to a thought',
    inputSchema: {
      type: 'object',
      properties: {
        thoughtId: { type: 'string', format: 'uuid' },
        labelId: { type: 'string', format: 'uuid' },
        projectId: { type: 'string', format: 'uuid' },
      },
      required: ['thoughtId', 'labelId', 'projectId'],
      additionalProperties: false,
    },
    parseArguments: (args) => schema.parse(args),
    execute: (context, args) => {
      const parsedArgs = args as z.infer<typeof schema>;
      return deps.addLabelToThought(context.userId, parsedArgs, context.scope);
    },
  };
}

import { z } from 'zod';
import type { ApiResult, ToolDefinition } from './tool-contract.js';

const schema = z.object({
  projectId: z.string().uuid(),
});

export interface ListLabelsDeps {
  listLabels: (userId: string, projectId: string, scope?: string) => Promise<ApiResult>;
}

export function createListLabelsTool(deps: ListLabelsDeps): ToolDefinition {
  return {
    name: 'list_labels',
    description: 'List all labels in a project',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', format: 'uuid' },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    parseArguments: (args) => schema.parse(args),
    execute: (context, args) => {
      const { projectId } = args as z.infer<typeof schema>;
      return deps.listLabels(context.userId, projectId, context.scope);
    },
  };
}

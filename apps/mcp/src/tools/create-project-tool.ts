import { z } from 'zod';
import type { ApiResult, ToolDefinition } from './tool-contract.js';

const schema = z.object({
  name: z.string().min(1),
  emoji: z.string().optional(),
});

export interface CreateProjectDeps {
  createProject: (userId: string, name: string, emoji: string | undefined, scope?: string) => Promise<ApiResult>;
}

export function createCreateProjectTool(deps: CreateProjectDeps): ToolDefinition {
  return {
    name: 'create_project',
    description: 'Create a new project',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        emoji: { type: 'string' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    parseArguments: (args) => schema.parse(args),
    execute: (context, args) => {
      const { name, emoji } = args as z.infer<typeof schema>;
      return deps.createProject(context.userId, name, emoji, context.scope);
    },
  };
}

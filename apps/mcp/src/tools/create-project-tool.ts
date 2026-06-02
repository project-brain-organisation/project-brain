import { z } from 'zod';
import type { ApiResult, ToolDefinition } from './tool-contract.js';

const schema = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
});

export interface CreateProjectDeps {
  createProject: (userId: string, title: string, body: string | undefined, scope?: string) => Promise<ApiResult>;
}

export function createCreateProjectTool(deps: CreateProjectDeps): ToolDefinition {
  return {
    name: 'create_project',
    description: 'Create a new project (root thought)',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['title'],
      additionalProperties: false,
    },
    parseArguments: (args) => schema.parse(args),
    execute: (context, args) => {
      const { title, body } = args as z.infer<typeof schema>;
      return deps.createProject(context.userId, title, body, context.scope);
    },
  };
}

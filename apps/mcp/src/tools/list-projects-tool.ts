import { z } from 'zod';
import type { ApiResult, ToolDefinition } from './tool-contract.js';

const schema = z.object({});

export interface ListProjectsDeps {
  listProjects: (userId: string, scope?: string) => Promise<ApiResult>;
}

export function createListProjectsTool(deps: ListProjectsDeps): ToolDefinition {
  return {
    name: 'list_projects',
    description: 'List all projects (root thoughts)',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    parseArguments: (args) => schema.parse(args),
    execute: (context) => deps.listProjects(context.userId, context.scope),
  };
}

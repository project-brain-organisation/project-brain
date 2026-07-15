import { z } from 'zod/v4';
import { defineTool, type ApiResult, type ToolDefinition } from './tool-contract.js';

export interface ListProjectsDeps {
  listProjects: (userId: string, scope?: string) => Promise<ApiResult>;
}

export function createListProjectsTool(deps: ListProjectsDeps): ToolDefinition {
  return defineTool({
    name: 'list_projects',
    description:
      "List the user's projects. Each has a `role`: \"owner\" (fully editable) or " +
      '"subscriber" (a public graph the user added — readable and searchable, but ' +
      'creating/editing/deleting in it will be rejected as read-only).',
    schema: z.object({}),
    execute: (ctx) => deps.listProjects(ctx.userId, ctx.scope),
  });
}

export interface CreateProjectDeps {
  createProject: (
    userId: string,
    name: string,
    emoji: string | undefined,
    scope?: string,
  ) => Promise<ApiResult>;
}

export function createCreateProjectTool(deps: CreateProjectDeps): ToolDefinition {
  return defineTool({
    name: 'create_project',
    description: 'Create a new project',
    schema: z.object({
      name: z.string().min(1),
      emoji: z.string().optional(),
    }),
    execute: (ctx, { name, emoji }) => deps.createProject(ctx.userId, name, emoji, ctx.scope),
  });
}

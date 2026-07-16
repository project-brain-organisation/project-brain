import { z } from 'zod/v4';
import { defineTool, type ApiResult, type ToolDefinition } from './tool-contract.js';

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export interface GetThoughtDeps {
  getThought: (userId: string, thoughtId: string, scope?: string) => Promise<ApiResult>;
}

export function createGetThoughtTool(deps: GetThoughtDeps): ToolDefinition {
  return defineTool({
    name: 'get_thought',
    description: 'Get a single thought by ID',
    schema: z.object({ thoughtId: z.string().uuid() }),
    execute: (ctx, { thoughtId }) => deps.getThought(ctx.userId, thoughtId, ctx.scope),
  });
}

export interface ListThoughtsDeps {
  listThoughts: (
    userId: string,
    params: { projectId: string },
    scope?: string,
  ) => Promise<ApiResult>;
}

export function createListThoughtsTool(deps: ListThoughtsDeps): ToolDefinition {
  return defineTool({
    name: 'list_thoughts',
    description: 'List all thoughts in a project',
    schema: z.object({ projectId: z.string().uuid() }),
    execute: (ctx, args) => deps.listThoughts(ctx.userId, args, ctx.scope),
  });
}

export interface CreateThoughtDeps {
  createThoughts: (
    userId: string,
    params: {
      projectId: string;
      thoughts: { ref?: string; body: string; title?: string; parentRef?: string; parentId?: string }[];
    },
    scope?: string,
  ) => Promise<ApiResult>;
}

export function createCreateThoughtTool(deps: CreateThoughtDeps): ToolDefinition {
  return defineTool({
    name: 'create_thought',
    description:
      'Create one or more thoughts in a project as a single all-or-nothing batch. ' +
      'Nest a thought under an existing one with parentId, or under another thought in the ' +
      'same batch by giving that thought a short ref and pointing parentRef at it. Refs ' +
      'never persist; the response echoes each ref beside the real id it became.',
    schema: z.object({
      projectId: z.string().uuid(),
      thoughts: z
        .array(
          z.object({
            ref: z.string().min(1).optional(),
            body: z.string().min(1),
            title: z.string().optional(),
            parentRef: z.string().min(1).optional(),
            parentId: z.string().uuid().optional(),
          }),
        )
        .min(1),
    }),
    execute: (ctx, args) => deps.createThoughts(ctx.userId, args, ctx.scope),
  });
}

export interface EditThoughtDeps {
  editThought: (
    userId: string,
    params: { thoughtId: string; body: string },
    scope?: string,
  ) => Promise<ApiResult>;
}

export function createEditThoughtTool(deps: EditThoughtDeps): ToolDefinition {
  return defineTool({
    name: 'edit_thought',
    description: 'Replace the body of an existing thought (re-chunks and re-embeds it)',
    schema: z.object({
      thoughtId: z.string().uuid(),
      body: z.string().min(1),
    }),
    execute: (ctx, args) => deps.editThought(ctx.userId, args, ctx.scope),
  });
}

export interface RemoveThoughtDeps {
  removeThought: (userId: string, thoughtId: string, scope?: string) => Promise<ApiResult>;
}

export function createRemoveThoughtTool(deps: RemoveThoughtDeps): ToolDefinition {
  return defineTool({
    name: 'remove_thought',
    description: 'Delete a thought',
    schema: z.object({ thoughtId: z.string().uuid() }),
    execute: (ctx, { thoughtId }) => deps.removeThought(ctx.userId, thoughtId, ctx.scope),
  });
}

export interface SetThoughtColorDeps {
  setThoughtColor: (
    userId: string,
    thoughtId: string,
    hex: string,
    scope?: string,
  ) => Promise<ApiResult>;
}

export function createSetThoughtColorTool(deps: SetThoughtColorDeps): ToolDefinition {
  return defineTool({
    name: 'set_thought_color',
    description: 'Set the color of a thought',
    schema: z.object({
      thoughtId: z.string().uuid(),
      hex: hexColor,
    }),
    execute: (ctx, { thoughtId, hex }) => deps.setThoughtColor(ctx.userId, thoughtId, hex, ctx.scope),
  });
}

export interface ClearThoughtColorDeps {
  clearThoughtColor: (userId: string, thoughtId: string, scope?: string) => Promise<ApiResult>;
}

export function createClearThoughtColorTool(deps: ClearThoughtColorDeps): ToolDefinition {
  return defineTool({
    name: 'clear_thought_color',
    description: 'Remove the color from a thought',
    schema: z.object({ thoughtId: z.string().uuid() }),
    execute: (ctx, { thoughtId }) => deps.clearThoughtColor(ctx.userId, thoughtId, ctx.scope),
  });
}

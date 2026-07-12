import { z } from 'zod/v4';
import { defineTool, type ApiResult, type ToolDefinition } from './tool-contract.js';

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export interface ListLabelsDeps {
  listLabels: (userId: string, projectId: string, scope?: string) => Promise<ApiResult>;
}

export function createListLabelsTool(deps: ListLabelsDeps): ToolDefinition {
  return defineTool({
    name: 'list_labels',
    description: 'List all labels in a project',
    schema: z.object({ projectId: z.string().uuid() }),
    execute: (ctx, { projectId }) => deps.listLabels(ctx.userId, projectId, ctx.scope),
  });
}

export interface CreateLabelDeps {
  createLabel: (
    userId: string,
    params: { name: string; color?: string; projectId: string },
    scope?: string,
  ) => Promise<ApiResult>;
}

export function createCreateLabelTool(deps: CreateLabelDeps): ToolDefinition {
  return defineTool({
    name: 'create_label',
    description: 'Create a new label in a project',
    schema: z.object({
      name: z.string().min(1),
      color: hexColor.optional(),
      projectId: z.string().uuid(),
    }),
    execute: (ctx, args) => deps.createLabel(ctx.userId, args, ctx.scope),
  });
}

export interface UpdateLabelDeps {
  updateLabel: (
    userId: string,
    params: { labelId: string; name?: string; color?: string; isEdge?: boolean },
    scope?: string,
  ) => Promise<ApiResult>;
}

export function createUpdateLabelTool(deps: UpdateLabelDeps): ToolDefinition {
  return defineTool({
    name: 'update_label',
    description: 'Update a label',
    schema: z.object({
      labelId: z.string().uuid(),
      name: z.string().min(1).optional(),
      color: hexColor.optional(),
      isEdge: z.boolean().optional(),
    }),
    execute: (ctx, args) => deps.updateLabel(ctx.userId, args, ctx.scope),
  });
}

export interface RemoveLabelDeps {
  removeLabel: (userId: string, labelId: string, scope?: string) => Promise<ApiResult>;
}

export function createRemoveLabelTool(deps: RemoveLabelDeps): ToolDefinition {
  return defineTool({
    name: 'remove_label',
    description: 'Delete a label',
    schema: z.object({ labelId: z.string().uuid() }),
    execute: (ctx, { labelId }) => deps.removeLabel(ctx.userId, labelId, ctx.scope),
  });
}

export interface AddLabelToThoughtDeps {
  addLabelToThought: (
    userId: string,
    params: { thoughtId: string; labelId: string; projectId: string },
    scope?: string,
  ) => Promise<ApiResult>;
}

export function createAddLabelToThoughtTool(deps: AddLabelToThoughtDeps): ToolDefinition {
  return defineTool({
    name: 'add_label_to_thought',
    description: 'Assign a label to a thought',
    schema: z.object({
      thoughtId: z.string().uuid(),
      labelId: z.string().uuid(),
      projectId: z.string().uuid(),
    }),
    execute: (ctx, args) => deps.addLabelToThought(ctx.userId, args, ctx.scope),
  });
}

export interface RemoveLabelFromThoughtDeps {
  removeLabelFromThought: (
    userId: string,
    params: { thoughtId: string; labelId: string },
    scope?: string,
  ) => Promise<ApiResult>;
}

export function createRemoveLabelFromThoughtTool(deps: RemoveLabelFromThoughtDeps): ToolDefinition {
  return defineTool({
    name: 'remove_label_from_thought',
    description: 'Remove a label from a thought',
    schema: z.object({
      thoughtId: z.string().uuid(),
      labelId: z.string().uuid(),
    }),
    execute: (ctx, args) => deps.removeLabelFromThought(ctx.userId, args, ctx.scope),
  });
}

export interface GetThoughtLabelsDeps {
  getThoughtLabels: (userId: string, thoughtId: string, scope?: string) => Promise<ApiResult>;
}

export function createGetThoughtLabelsTool(deps: GetThoughtLabelsDeps): ToolDefinition {
  return defineTool({
    name: 'get_thought_labels',
    description: 'Get all labels on a thought',
    schema: z.object({ thoughtId: z.string().uuid() }),
    execute: (ctx, { thoughtId }) => deps.getThoughtLabels(ctx.userId, thoughtId, ctx.scope),
  });
}

export interface SetLabelEdgeDeps {
  setLabelEdge: (
    userId: string,
    labelId: string,
    isEdge: boolean,
    scope?: string,
  ) => Promise<ApiResult>;
}

export function createSetLabelEdgeTool(deps: SetLabelEdgeDeps): ToolDefinition {
  return defineTool({
    name: 'set_label_edge',
    description: 'Promote/demote a label as a graph edge',
    schema: z.object({
      labelId: z.string().uuid(),
      isEdge: z.boolean(),
    }),
    execute: (ctx, { labelId, isEdge }) => deps.setLabelEdge(ctx.userId, labelId, isEdge, ctx.scope),
  });
}

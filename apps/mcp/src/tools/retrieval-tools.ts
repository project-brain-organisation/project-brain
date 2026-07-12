import { z } from 'zod/v4';
import { defineTool, type ApiResult, type ToolDefinition } from './tool-contract.js';

export interface RememberDeps {
  remember: (
    userId: string,
    query: string,
    n: number,
    projectId?: string,
    scope?: string,
  ) => Promise<ApiResult>;
}

export function createRememberTool(deps: RememberDeps): ToolDefinition {
  return defineTool({
    name: 'remember',
    description: 'Search the knowledge base by semantic similarity',
    schema: z.object({
      query: z.string().min(1),
      n: z.number().int().min(1).max(20).default(5),
      projectId: z.string().uuid().optional().describe('Optional: restrict the search to one project'),
    }),
    execute: (ctx, { query, n, projectId }) =>
      deps.remember(ctx.userId, query, n, projectId, ctx.scope),
  });
}

export interface ElaborateDeps {
  elaborate: (userId: string, chunkId: string, scope?: string) => Promise<ApiResult>;
}

export function createElaborateTool(deps: ElaborateDeps): ToolDefinition {
  return defineTool({
    name: 'elaborate',
    description: 'Retrieve the full thought a chunk belongs to, plus parent and siblings',
    schema: z.object({ chunkId: z.string().uuid() }),
    execute: (ctx, { chunkId }) => deps.elaborate(ctx.userId, chunkId, ctx.scope),
  });
}

export interface ThoughtToPromptDeps {
  thoughtToPrompt: (userId: string, thoughtId: string, scope?: string) => Promise<ApiResult>;
}

export function createThoughtToPromptTool(deps: ThoughtToPromptDeps): ToolDefinition {
  return defineTool({
    name: 'thought_to_prompt',
    description: 'Build a structured LLM prompt from a thought (parent, children, labels)',
    schema: z.object({ thoughtId: z.string().uuid() }),
    execute: (ctx, { thoughtId }) => deps.thoughtToPrompt(ctx.userId, thoughtId, ctx.scope),
  });
}

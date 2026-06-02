import { z } from 'zod';
import type { ApiResult, ToolDefinition } from './tool-contract.js';

const schema = z.object({
  thoughtId: z.string().uuid(),
});

export interface ThoughtToPromptDeps {
  thoughtToPrompt: (userId: string, thoughtId: string, scope?: string) => Promise<ApiResult>;
}

export function createThoughtToPromptTool(deps: ThoughtToPromptDeps): ToolDefinition {
  return {
    name: 'thought_to_prompt',
    description: 'Build a structured LLM prompt from a thought (parent, children, labels)',
    inputSchema: {
      type: 'object',
      properties: {
        thoughtId: { type: 'string', format: 'uuid' },
      },
      required: ['thoughtId'],
      additionalProperties: false,
    },
    parseArguments: (args) => schema.parse(args),
    execute: (context, args) => {
      const { thoughtId } = args as z.infer<typeof schema>;
      return deps.thoughtToPrompt(context.userId, thoughtId, context.scope);
    },
  };
}

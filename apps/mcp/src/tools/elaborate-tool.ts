import { z } from 'zod';
import type { ApiResult, ToolDefinition } from './tool-contract.js';

const schema = z.object({
  chunkId: z.string().uuid(),
});

export interface ElaborateDeps {
  elaborate: (userId: string, chunkId: string, scope?: string) => Promise<ApiResult>;
}

export function createElaborateTool(deps: ElaborateDeps): ToolDefinition {
  return {
    name: 'elaborate',
    description: 'Retrieve the full thought a chunk belongs to, plus parent and siblings',
    inputSchema: {
      type: 'object',
      properties: {
        chunkId: { type: 'string', format: 'uuid' },
      },
      required: ['chunkId'],
      additionalProperties: false,
    },
    parseArguments: (args) => schema.parse(args),
    execute: (context, args) => {
      const { chunkId } = args as z.infer<typeof schema>;
      return deps.elaborate(context.userId, chunkId, context.scope);
    },
  };
}

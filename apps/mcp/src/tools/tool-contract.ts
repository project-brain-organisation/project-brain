import { z } from 'zod/v4';

export type ApiResult =
  | { ok: true; status: number; data: unknown }
  | { ok: false; status: number; error: string };

export interface ToolContext {
  userId: string;
  scope?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
  parseArguments: (args: unknown) => unknown;
  execute: (context: ToolContext, args: unknown) => Promise<ApiResult>;
}

// Builds a ToolDefinition from a single zod schema. The JSON Schema advertised
// to MCP clients is derived from that schema, so the two can never drift, and
// execute() receives typed arguments instead of unknown.
export function defineTool<S extends z.ZodObject>(tool: {
  name: string;
  description: string;
  schema: S;
  execute: (context: ToolContext, args: z.infer<S>) => Promise<ApiResult>;
}): ToolDefinition {
  const { $schema: _, ...jsonSchema } = z.toJSONSchema(tool.schema, { io: 'input' });

  return {
    name: tool.name,
    description: tool.description,
    inputSchema: {
      type: 'object',
      properties: {},
      ...jsonSchema,
      additionalProperties: false,
    } as ToolDefinition['inputSchema'],
    parseArguments: (args) => tool.schema.parse(args),
    execute: (context, args) => tool.execute(context, args as z.infer<S>),
  };
}

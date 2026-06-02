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

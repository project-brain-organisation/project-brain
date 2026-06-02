import type { ApiClient } from '../api-client.js';
import { createAddLabelToThoughtTool } from './add-label-to-thought-tool.js';
import { createClearThoughtColorTool } from './clear-thought-color-tool.js';
import { createCreateLabelTool } from './create-label-tool.js';
import { createCreateProjectTool } from './create-project-tool.js';
import { createCreateThoughtTool } from './create-thought-tool.js';
import { createEditThoughtTool } from './edit-thought-tool.js';
import { createElaborateTool } from './elaborate-tool.js';
import { createGetThoughtTool } from './get-thought-tool.js';
import { createGetThoughtLabelsTool } from './get-thought-labels-tool.js';
import { createListProjectsTool } from './list-projects-tool.js';
import { createListLabelsTool } from './list-labels-tool.js';
import { createListThoughtsTool } from './list-thoughts-tool.js';
import { createRemoveLabelFromThoughtTool } from './remove-label-from-thought-tool.js';
import { createRemoveLabelTool } from './remove-label-tool.js';
import { createRemoveThoughtTool } from './remove-thought-tool.js';
import { createRememberTool } from './remember-tool.js';
import { createSetLabelEdgeTool } from './set-label-edge-tool.js';
import { createSetThoughtColorTool } from './set-thought-color-tool.js';
import { createThoughtToPromptTool } from './thought-to-prompt-tool.js';
import { createUpdateLabelTool } from './update-label-tool.js';
import type { ToolDefinition } from './tool-contract.js';

export function createToolRegistry(apiClient: ApiClient) {
  const toolDefinitions: ToolDefinition[] = [
    createRememberTool(apiClient),
    createElaborateTool(apiClient),
    createThoughtToPromptTool(apiClient),
    createListProjectsTool(apiClient),
    createCreateProjectTool(apiClient),
    createGetThoughtTool(apiClient),
    createListThoughtsTool(apiClient),
    createCreateThoughtTool(apiClient),
    createEditThoughtTool(apiClient),
    createRemoveThoughtTool(apiClient),
    createListLabelsTool(apiClient),
    createCreateLabelTool(apiClient),
    createUpdateLabelTool(apiClient),
    createRemoveLabelTool(apiClient),
    createAddLabelToThoughtTool(apiClient),
    createRemoveLabelFromThoughtTool(apiClient),
    createGetThoughtLabelsTool(apiClient),
    createSetLabelEdgeTool(apiClient),
    createSetThoughtColorTool(apiClient),
    createClearThoughtColorTool(apiClient),
  ];

  const tools = toolDefinitions.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));

  const toolByName = new Map(toolDefinitions.map((t) => [t.name, t]));

  return { toolDefinitions, tools, toolByName };
}

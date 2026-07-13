import type { ApiClient } from '../api-client.js';
import type { ToolDefinition } from './tool-contract.js';
import {
  createElaborateTool,
  createRememberTool,
  createThoughtToPromptTool,
} from './retrieval-tools.js';
import { createCreateProjectTool, createListProjectsTool } from './project-tools.js';
import {
  createClearThoughtColorTool,
  createCreateThoughtTool,
  createEditThoughtTool,
  createGetThoughtTool,
  createListThoughtsTool,
  createRemoveThoughtTool,
  createSetThoughtColorTool,
} from './thought-tools.js';
import {
  createCreateRelationshipTool,
  createListRelationshipsTool,
} from './relationship-tools.js';
import {
  createAddLabelToThoughtTool,
  createCreateLabelTool,
  createGetThoughtLabelsTool,
  createListLabelsTool,
  createRemoveLabelFromThoughtTool,
  createRemoveLabelTool,
  createSetLabelEdgeTool,
  createUpdateLabelTool,
} from './label-tools.js';

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
    createCreateRelationshipTool(apiClient),
    createListRelationshipsTool(apiClient),
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

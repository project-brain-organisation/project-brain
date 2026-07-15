import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElaborateTool, createThoughtToPromptTool } from './retrieval-tools.js';
import { createCreateProjectTool } from './project-tools.js';
import {
  createClearThoughtColorTool,
  createCreateThoughtTool,
  createEditThoughtTool,
  createListThoughtsTool,
  createRemoveThoughtTool,
  createSetThoughtColorTool,
} from './thought-tools.js';
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

const uuidA = '550e8400-e29b-41d4-a716-446655440000';
const uuidB = '4de89e56-7b8a-4d89-adf5-dbf84f8f4123';
const okResult = { ok: true as const, status: 200, data: { ok: true } };

describe('elaborate tool', () => {
  it('parses and executes with expected args', async () => {
    let captured: { userId?: string; chunkId?: string; scope?: string } = {};
    const tool = createElaborateTool({
      elaborate: async (userId, chunkId, scope) => {
        captured = { userId, chunkId, scope };
        return okResult;
      },
    });

    const args = tool.parseArguments({ chunkId: uuidA });
    const result = await tool.execute({ userId: 'u1', scope: 'project-1' }, args);

    assert.equal(tool.name, 'elaborate');
    assert.equal(captured.userId, 'u1');
    assert.equal(captured.chunkId, uuidA);
    assert.equal(captured.scope, 'project-1');
    assert.equal(result.ok, true);
  });

  it('rejects invalid chunk id', () => {
    const tool = createElaborateTool({ elaborate: async () => okResult });
    assert.throws(() => tool.parseArguments({ chunkId: 'bad-id' }));
  });
});

describe('thought_to_prompt tool', () => {
  it('parses and executes with expected args', async () => {
    let capturedThoughtId: string | undefined;
    const tool = createThoughtToPromptTool({
      thoughtToPrompt: async (_userId, thoughtId) => {
        capturedThoughtId = thoughtId;
        return okResult;
      },
    });

    const args = tool.parseArguments({ thoughtId: uuidA });
    await tool.execute({ userId: 'u1' }, args);

    assert.equal(tool.name, 'thought_to_prompt');
    assert.equal(capturedThoughtId, uuidA);
  });

  it('rejects missing thoughtId', () => {
    const tool = createThoughtToPromptTool({ thoughtToPrompt: async () => okResult });
    assert.throws(() => tool.parseArguments({}));
  });
});

describe('create_project tool', () => {
  it('parses and executes with expected args', async () => {
    let captured: { name?: string; emoji?: string } = {};
    const tool = createCreateProjectTool({
      createProject: async (_userId, name, emoji) => {
        captured = { name, emoji };
        return okResult;
      },
    });

    const args = tool.parseArguments({ name: 'New Project', emoji: '🧠' });
    await tool.execute({ userId: 'u1' }, args);

    assert.equal(tool.name, 'create_project');
    assert.equal(captured.name, 'New Project');
    assert.equal(captured.emoji, '🧠');
  });

  it('rejects empty name', () => {
    const tool = createCreateProjectTool({ createProject: async () => okResult });
    assert.throws(() => tool.parseArguments({ name: '' }));
  });
});

describe('list_thoughts tool', () => {
  it('parses projectId and executes', async () => {
    let captured: { projectId?: string } | undefined;
    const tool = createListThoughtsTool({
      listThoughts: async (_userId, params) => {
        captured = params;
        return okResult;
      },
    });

    const args = tool.parseArguments({ projectId: uuidB });
    await tool.execute({ userId: 'u1' }, args);

    assert.equal(tool.name, 'list_thoughts');
    assert.equal(captured?.projectId, uuidB);
  });

  it('rejects missing projectId', () => {
    const tool = createListThoughtsTool({ listThoughts: async () => okResult });
    assert.throws(() => tool.parseArguments({}));
  });

  it('rejects invalid projectId', () => {
    const tool = createListThoughtsTool({ listThoughts: async () => okResult });
    assert.throws(() => tool.parseArguments({ projectId: 'nope' }));
  });
});

describe('create_thought tool', () => {
  it('parses and executes', async () => {
    let captured: { body?: string; projectId?: string } = {};
    const tool = createCreateThoughtTool({
      createThought: async (_userId, params) => {
        captured = params;
        return okResult;
      },
    });

    const args = tool.parseArguments({ body: 'Some thought', title: 'T', projectId: uuidA });
    await tool.execute({ userId: 'u1' }, args);

    assert.equal(tool.name, 'create_thought');
    assert.equal(captured.body, 'Some thought');
    assert.equal(captured.projectId, uuidA);
  });

  it('forwards parentId for sub-thoughts', async () => {
    let captured: { parentId?: string } = {};
    const tool = createCreateThoughtTool({
      createThought: async (_userId, params) => {
        captured = params;
        return okResult;
      },
    });

    const args = tool.parseArguments({ body: 'Child', projectId: uuidA, parentId: uuidB });
    await tool.execute({ userId: 'u1' }, args);

    assert.equal(captured.parentId, uuidB);
  });

  it('rejects a non-uuid parentId', () => {
    const tool = createCreateThoughtTool({ createThought: async () => okResult });
    assert.throws(() => tool.parseArguments({ body: 'x', projectId: uuidA, parentId: 'nope' }));
  });

  it('rejects missing body', () => {
    const tool = createCreateThoughtTool({ createThought: async () => okResult });
    assert.throws(() => tool.parseArguments({ title: 'x', projectId: uuidA }));
  });

  it('rejects missing projectId', () => {
    const tool = createCreateThoughtTool({ createThought: async () => okResult });
    assert.throws(() => tool.parseArguments({ body: 'thought' }));
  });
});

describe('edit_thought tool', () => {
  it('parses and executes', async () => {
    let captured: { thoughtId?: string; body?: string } = {};
    const tool = createEditThoughtTool({
      editThought: async (_userId, params) => {
        captured = params;
        return okResult;
      },
    });

    const args = tool.parseArguments({ thoughtId: uuidA, body: 'Updated body' });
    await tool.execute({ userId: 'u1' }, args);

    assert.equal(tool.name, 'edit_thought');
    assert.equal(captured.thoughtId, uuidA);
    assert.equal(captured.body, 'Updated body');
  });

  it('rejects missing thoughtId', () => {
    const tool = createEditThoughtTool({ editThought: async () => okResult });
    assert.throws(() => tool.parseArguments({ body: 'x' }));
  });

  it('rejects missing body', () => {
    const tool = createEditThoughtTool({ editThought: async () => okResult });
    assert.throws(() => tool.parseArguments({ thoughtId: uuidA }));
  });
});

describe('remove_thought tool', () => {
  it('parses and executes', async () => {
    let capturedThoughtId: string | undefined;
    const tool = createRemoveThoughtTool({
      removeThought: async (_userId, thoughtId) => {
        capturedThoughtId = thoughtId;
        return okResult;
      },
    });

    const args = tool.parseArguments({ thoughtId: uuidA });
    await tool.execute({ userId: 'u1' }, args);

    assert.equal(tool.name, 'remove_thought');
    assert.equal(capturedThoughtId, uuidA);
  });

  it('rejects invalid thoughtId', () => {
    const tool = createRemoveThoughtTool({ removeThought: async () => okResult });
    assert.throws(() => tool.parseArguments({ thoughtId: 'bad' }));
  });
});

describe('list_labels tool', () => {
  it('parses and executes', async () => {
    let capturedProjectId: string | undefined;
    const tool = createListLabelsTool({
      listLabels: async (_userId, projectId) => {
        capturedProjectId = projectId;
        return okResult;
      },
    });

    const args = tool.parseArguments({ projectId: uuidA });
    await tool.execute({ userId: 'u1' }, args);

    assert.equal(tool.name, 'list_labels');
    assert.equal(capturedProjectId, uuidA);
  });

  it('rejects invalid projectId', () => {
    const tool = createListLabelsTool({ listLabels: async () => okResult });
    assert.throws(() => tool.parseArguments({ projectId: 'bad' }));
  });
});

describe('create_label tool', () => {
  it('parses and executes', async () => {
    let capturedName: string | undefined;
    const tool = createCreateLabelTool({
      createLabel: async (_userId, params) => {
        capturedName = params.name;
        return okResult;
      },
    });

    const args = tool.parseArguments({ name: 'Priority', color: '#A1B2C3', projectId: uuidA });
    await tool.execute({ userId: 'u1' }, args);

    assert.equal(tool.name, 'create_label');
    assert.equal(capturedName, 'Priority');
  });

  it('rejects invalid color', () => {
    const tool = createCreateLabelTool({ createLabel: async () => okResult });
    assert.throws(() => tool.parseArguments({ name: 'x', color: 'red' }));
  });
});

describe('update_label tool', () => {
  it('parses and executes', async () => {
    let capturedLabelId: string | undefined;
    const tool = createUpdateLabelTool({
      updateLabel: async (_userId, params) => {
        capturedLabelId = params.labelId;
        return okResult;
      },
    });

    const args = tool.parseArguments({ labelId: uuidA, isEdge: true });
    await tool.execute({ userId: 'u1' }, args);

    assert.equal(tool.name, 'update_label');
    assert.equal(capturedLabelId, uuidA);
  });

  it('rejects invalid labelId', () => {
    const tool = createUpdateLabelTool({ updateLabel: async () => okResult });
    assert.throws(() => tool.parseArguments({ labelId: 'bad' }));
  });
});

describe('remove_label tool', () => {
  it('parses and executes', async () => {
    let capturedLabelId: string | undefined;
    const tool = createRemoveLabelTool({
      removeLabel: async (_userId, labelId) => {
        capturedLabelId = labelId;
        return okResult;
      },
    });

    const args = tool.parseArguments({ labelId: uuidA });
    await tool.execute({ userId: 'u1' }, args);

    assert.equal(tool.name, 'remove_label');
    assert.equal(capturedLabelId, uuidA);
  });

  it('rejects invalid labelId', () => {
    const tool = createRemoveLabelTool({ removeLabel: async () => okResult });
    assert.throws(() => tool.parseArguments({ labelId: 'bad' }));
  });
});

describe('add_label_to_thought tool', () => {
  it('parses and executes', async () => {
    let captured: { thoughtId?: string; labelId?: string; projectId?: string } = {};
    const tool = createAddLabelToThoughtTool({
      addLabelToThought: async (_userId, params) => {
        captured = params;
        return okResult;
      },
    });

    const args = tool.parseArguments({ thoughtId: uuidA, labelId: uuidB, projectId: uuidA });
    await tool.execute({ userId: 'u1' }, args);

    assert.equal(tool.name, 'add_label_to_thought');
    assert.equal(captured.thoughtId, uuidA);
    assert.equal(captured.labelId, uuidB);
    assert.equal(captured.projectId, uuidA);
  });

  it('rejects missing projectId', () => {
    const tool = createAddLabelToThoughtTool({ addLabelToThought: async () => okResult });
    assert.throws(() => tool.parseArguments({ thoughtId: uuidA, labelId: uuidB }));
  });

  it('rejects invalid ids', () => {
    const tool = createAddLabelToThoughtTool({ addLabelToThought: async () => okResult });
    assert.throws(() => tool.parseArguments({ thoughtId: 'bad', labelId: uuidB, projectId: uuidA }));
  });
});

describe('remove_label_from_thought tool', () => {
  it('parses and executes', async () => {
    let captured: { thoughtId?: string; labelId?: string } = {};
    const tool = createRemoveLabelFromThoughtTool({
      removeLabelFromThought: async (_userId, params) => {
        captured = params;
        return okResult;
      },
    });

    const args = tool.parseArguments({ thoughtId: uuidA, labelId: uuidB });
    await tool.execute({ userId: 'u1' }, args);

    assert.equal(tool.name, 'remove_label_from_thought');
    assert.equal(captured.thoughtId, uuidA);
    assert.equal(captured.labelId, uuidB);
  });

  it('rejects invalid labelId', () => {
    const tool = createRemoveLabelFromThoughtTool({ removeLabelFromThought: async () => okResult });
    assert.throws(() => tool.parseArguments({ thoughtId: uuidA, labelId: 'bad' }));
  });
});

describe('get_thought_labels tool', () => {
  it('parses and executes', async () => {
    let capturedThoughtId: string | undefined;
    const tool = createGetThoughtLabelsTool({
      getThoughtLabels: async (_userId, thoughtId) => {
        capturedThoughtId = thoughtId;
        return okResult;
      },
    });

    const args = tool.parseArguments({ thoughtId: uuidA });
    await tool.execute({ userId: 'u1' }, args);

    assert.equal(tool.name, 'get_thought_labels');
    assert.equal(capturedThoughtId, uuidA);
  });

  it('rejects invalid thoughtId', () => {
    const tool = createGetThoughtLabelsTool({ getThoughtLabels: async () => okResult });
    assert.throws(() => tool.parseArguments({ thoughtId: 'bad' }));
  });
});

describe('set_label_edge tool', () => {
  it('parses and executes', async () => {
    let captured: { labelId?: string; isEdge?: boolean } = {};
    const tool = createSetLabelEdgeTool({
      setLabelEdge: async (_userId, labelId, isEdge) => {
        captured = { labelId, isEdge };
        return okResult;
      },
    });

    const args = tool.parseArguments({ labelId: uuidA, isEdge: true });
    await tool.execute({ userId: 'u1' }, args);

    assert.equal(tool.name, 'set_label_edge');
    assert.equal(captured.labelId, uuidA);
    assert.equal(captured.isEdge, true);
  });

  it('rejects missing isEdge', () => {
    const tool = createSetLabelEdgeTool({ setLabelEdge: async () => okResult });
    assert.throws(() => tool.parseArguments({ labelId: uuidA }));
  });
});

describe('set_thought_color tool', () => {
  it('parses and executes', async () => {
    let capturedHex: string | undefined;
    const tool = createSetThoughtColorTool({
      setThoughtColor: async (_userId, _thoughtId, hex) => {
        capturedHex = hex;
        return okResult;
      },
    });

    const args = tool.parseArguments({ thoughtId: uuidA, hex: '#112233' });
    await tool.execute({ userId: 'u1' }, args);

    assert.equal(tool.name, 'set_thought_color');
    assert.equal(capturedHex, '#112233');
  });

  it('rejects invalid hex', () => {
    const tool = createSetThoughtColorTool({ setThoughtColor: async () => okResult });
    assert.throws(() => tool.parseArguments({ thoughtId: uuidA, hex: '#12345' }));
  });
});

describe('clear_thought_color tool', () => {
  it('parses and executes', async () => {
    let capturedThoughtId: string | undefined;
    const tool = createClearThoughtColorTool({
      clearThoughtColor: async (_userId, thoughtId) => {
        capturedThoughtId = thoughtId;
        return okResult;
      },
    });

    const args = tool.parseArguments({ thoughtId: uuidA });
    await tool.execute({ userId: 'u1' }, args);

    assert.equal(tool.name, 'clear_thought_color');
    assert.equal(capturedThoughtId, uuidA);
  });

  it('rejects invalid thoughtId', () => {
    const tool = createClearThoughtColorTool({ clearThoughtColor: async () => okResult });
    assert.throws(() => tool.parseArguments({ thoughtId: 'bad' }));
  });
});

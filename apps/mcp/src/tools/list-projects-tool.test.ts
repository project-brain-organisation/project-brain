import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createListProjectsTool } from './list-projects-tool.js';
import type { ApiResult } from './tool-contract.js';

describe('list_projects tool', () => {
  const mockData = [{ id: '1', title: 'Project A' }];

  function makeTool(result: ApiResult = { ok: true, status: 200, data: mockData }) {
    return createListProjectsTool({
      listProjects: async () => result,
    });
  }

  it('has correct metadata', () => {
    const tool = makeTool();
    assert.equal(tool.name, 'list_projects');
    assert.equal(tool.description, 'List all projects');
    assert.deepEqual(tool.inputSchema.properties, {});
  });

  it('parseArguments accepts empty object', () => {
    const tool = makeTool();
    const result = tool.parseArguments({});
    assert.deepEqual(result, {});
  });

  it('parseArguments rejects unknown keys in strict mode', () => {
    const tool = makeTool();
    // zod strip mode — extra keys are stripped, not rejected
    const result = tool.parseArguments({ extra: true });
    assert.deepEqual(result, {});
  });

  it('execute passes userId and scope to dep', async () => {
    let capturedUserId: string | undefined;
    let capturedScope: string | undefined;

    const tool = createListProjectsTool({
      listProjects: async (userId, scope) => {
        capturedUserId = userId;
        capturedScope = scope;
        return { ok: true, status: 200, data: [] };
      },
    });

    await tool.execute({ userId: 'user-1', scope: 'project-abc' }, {});
    assert.equal(capturedUserId, 'user-1');
    assert.equal(capturedScope, 'project-abc');
  });

  it('execute returns ok result from dep', async () => {
    const tool = makeTool();
    const result = await tool.execute({ userId: 'u1' }, {});
    assert.equal(result.ok, true);
    assert.deepEqual((result as any).data, mockData);
  });

  it('execute returns error result from dep', async () => {
    const tool = makeTool({ ok: false, status: 500, error: 'boom' });
    const result = await tool.execute({ userId: 'u1' }, {});
    assert.equal(result.ok, false);
    assert.equal((result as any).error, 'boom');
  });
});

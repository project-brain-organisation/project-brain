import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createGetThoughtTool } from './thought-tools.js';
import type { ApiResult } from './tool-contract.js';

const validUuid = '550e8400-e29b-41d4-a716-446655440000';

describe('get_thought tool', () => {
  const mockThought = { id: validUuid, title: 'Test', body: 'Hello' };

  function makeTool(result: ApiResult = { ok: true, status: 200, data: mockThought }) {
    return createGetThoughtTool({
      getThought: async () => result,
    });
  }

  it('has correct metadata', () => {
    const tool = makeTool();
    assert.equal(tool.name, 'get_thought');
    assert.equal(tool.inputSchema.required?.includes('thoughtId'), true);
  });

  it('parseArguments accepts valid uuid', () => {
    const tool = makeTool();
    const result = tool.parseArguments({ thoughtId: validUuid }) as any;
    assert.equal(result.thoughtId, validUuid);
  });

  it('parseArguments rejects missing thoughtId', () => {
    const tool = makeTool();
    assert.throws(() => tool.parseArguments({}));
  });

  it('parseArguments rejects non-uuid string', () => {
    const tool = makeTool();
    assert.throws(() => tool.parseArguments({ thoughtId: 'not-a-uuid' }));
  });

  it('execute passes userId, thoughtId, scope to dep', async () => {
    let capturedUserId: string | undefined;
    let capturedThoughtId: string | undefined;
    let capturedScope: string | undefined;

    const tool = createGetThoughtTool({
      getThought: async (userId, thoughtId, scope) => {
        capturedUserId = userId;
        capturedThoughtId = thoughtId;
        capturedScope = scope;
        return { ok: true, status: 200, data: {} };
      },
    });

    const args = tool.parseArguments({ thoughtId: validUuid });
    await tool.execute({ userId: 'user-2', scope: 'proj-1' }, args);

    assert.equal(capturedUserId, 'user-2');
    assert.equal(capturedThoughtId, validUuid);
    assert.equal(capturedScope, 'proj-1');
  });

  it('execute returns ok result from dep', async () => {
    const tool = makeTool();
    const args = tool.parseArguments({ thoughtId: validUuid });
    const result = await tool.execute({ userId: 'u1' }, args);
    assert.equal(result.ok, true);
    assert.deepEqual((result as any).data, mockThought);
  });

  it('execute returns error result from dep', async () => {
    const tool = makeTool({ ok: false, status: 404, error: 'Not found' });
    const args = tool.parseArguments({ thoughtId: validUuid });
    const result = await tool.execute({ userId: 'u1' }, args);
    assert.equal(result.ok, false);
    assert.equal((result as any).status, 404);
  });
});

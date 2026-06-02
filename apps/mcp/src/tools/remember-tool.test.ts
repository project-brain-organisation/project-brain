import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRememberTool } from './remember-tool.js';
import type { ApiResult } from './tool-contract.js';

describe('remember tool', () => {
  const mockResults = [{ id: '1', score: 0.95, body: 'related note' }];

  function makeTool(result: ApiResult = { ok: true, status: 200, data: mockResults }) {
    return createRememberTool({
      remember: async () => result,
    });
  }

  it('has correct metadata', () => {
    const tool = makeTool();
    assert.equal(tool.name, 'remember');
    assert.equal(tool.inputSchema.required?.includes('query'), true);
  });

  it('parseArguments accepts valid input with default n', () => {
    const tool = makeTool();
    const result = tool.parseArguments({ query: 'hello' }) as any;
    assert.equal(result.query, 'hello');
    assert.equal(result.n, 5);
  });

  it('parseArguments accepts explicit n', () => {
    const tool = makeTool();
    const result = tool.parseArguments({ query: 'hello', n: 10 }) as any;
    assert.equal(result.n, 10);
  });

  it('parseArguments rejects empty query', () => {
    const tool = makeTool();
    assert.throws(() => tool.parseArguments({ query: '' }));
  });

  it('parseArguments rejects missing query', () => {
    const tool = makeTool();
    assert.throws(() => tool.parseArguments({}));
  });

  it('parseArguments rejects n out of range', () => {
    const tool = makeTool();
    assert.throws(() => tool.parseArguments({ query: 'hi', n: 0 }));
    assert.throws(() => tool.parseArguments({ query: 'hi', n: 21 }));
  });

  it('execute passes userId, query, n, scope to dep', async () => {
    let capturedUserId: string | undefined;
    let capturedQuery: string | undefined;
    let capturedN: number | undefined;
    let capturedScope: string | undefined;

    const tool = createRememberTool({
      remember: async (userId, query, n, scope) => {
        capturedUserId = userId;
        capturedQuery = query;
        capturedN = n;
        capturedScope = scope;
        return { ok: true, status: 200, data: [] };
      },
    });

    const args = tool.parseArguments({ query: 'test query', n: 3 });
    await tool.execute({ userId: 'user-3', scope: 'proj-2' }, args);

    assert.equal(capturedUserId, 'user-3');
    assert.equal(capturedQuery, 'test query');
    assert.equal(capturedN, 3);
    assert.equal(capturedScope, 'proj-2');
  });

  it('execute returns ok result from dep', async () => {
    const tool = makeTool();
    const args = tool.parseArguments({ query: 'search' });
    const result = await tool.execute({ userId: 'u1' }, args);
    assert.equal(result.ok, true);
    assert.deepEqual((result as any).data, mockResults);
  });

  it('execute returns error result from dep', async () => {
    const tool = makeTool({ ok: false, status: 503, error: 'Unavailable' });
    const args = tool.parseArguments({ query: 'search' });
    const result = await tool.execute({ userId: 'u1' }, args);
    assert.equal(result.ok, false);
    assert.equal((result as any).status, 503);
  });
});

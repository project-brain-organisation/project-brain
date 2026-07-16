import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCreateRelationshipTool,
  createListRelationshipsTool,
  createRemoveRelationshipTool,
} from './relationship-tools.js';
import type { ApiResult } from './tool-contract.js';

const projectId = '550e8400-e29b-41d4-a716-446655440000';
const sourceId = '550e8400-e29b-41d4-a716-446655440001';
const targetId = '550e8400-e29b-41d4-a716-446655440002';
const labelId = '550e8400-e29b-41d4-a716-446655440003';

describe('create_relationship tool', () => {
  const mockRel = { id: 'rel-1', sourceId, targetId, kind: 'edge', labelId };

  function makeTool(result: ApiResult = { ok: true, status: 201, data: [mockRel] }) {
    return createCreateRelationshipTool({
      createRelationships: async () => result,
    });
  }

  it('has correct metadata', () => {
    const tool = makeTool();
    assert.equal(tool.name, 'create_relationship');
    for (const field of ['projectId', 'relationships']) {
      assert.equal(tool.inputSchema.required?.includes(field), true);
    }
  });

  it('parseArguments accepts a valid batch', () => {
    const tool = makeTool();
    const result = tool.parseArguments({
      projectId,
      relationships: [{ sourceId, targetId, labelId }],
    }) as any;
    assert.equal(result.relationships[0].sourceId, sourceId);
    assert.equal(result.relationships[0].labelId, labelId);
  });

  it('parseArguments rejects missing labelId', () => {
    const tool = makeTool();
    assert.throws(() =>
      tool.parseArguments({ projectId, relationships: [{ sourceId, targetId }] }),
    );
  });

  it('parseArguments rejects non-uuid ids', () => {
    const tool = makeTool();
    assert.throws(() =>
      tool.parseArguments({ projectId, relationships: [{ sourceId: 'nope', targetId, labelId }] }),
    );
  });

  it('parseArguments rejects an empty batch', () => {
    const tool = makeTool();
    assert.throws(() => tool.parseArguments({ projectId, relationships: [] }));
  });

  it('execute passes userId, args, scope to dep', async () => {
    let captured: { userId?: string; params?: unknown; scope?: string } = {};
    const tool = createCreateRelationshipTool({
      createRelationships: async (userId, params, scope) => {
        captured = { userId, params, scope };
        return { ok: true, status: 201, data: [] };
      },
    });

    const args = tool.parseArguments({
      projectId,
      relationships: [{ sourceId, targetId, labelId }],
    });
    await tool.execute({ userId: 'user-2', scope: 'proj-1' }, args);

    assert.equal(captured.userId, 'user-2');
    assert.equal(captured.scope, 'proj-1');
    assert.deepEqual(captured.params, {
      projectId,
      relationships: [{ sourceId, targetId, labelId }],
    });
  });

  it('execute surfaces error results (e.g. duplicate 409)', async () => {
    const tool = makeTool({ ok: false, status: 409, error: 'Relationship already exists' });
    const args = tool.parseArguments({ projectId, relationships: [{ sourceId, targetId, labelId }] });
    const result = await tool.execute({ userId: 'u1' }, args);
    assert.equal(result.ok, false);
    assert.equal((result as any).status, 409);
  });
});

describe('remove_relationship tool', () => {
  const relationshipId = '550e8400-e29b-41d4-a716-446655440004';

  function makeTool(result: ApiResult = { ok: true, status: 200, data: { deleted: true } }) {
    return createRemoveRelationshipTool({
      removeRelationship: async () => result,
    });
  }

  it('has correct metadata', () => {
    const tool = makeTool();
    assert.equal(tool.name, 'remove_relationship');
    assert.equal(tool.inputSchema.required?.includes('relationshipId'), true);
  });

  it('parseArguments rejects a non-uuid id', () => {
    const tool = makeTool();
    assert.throws(() => tool.parseArguments({ relationshipId: 'nope' }));
  });

  it('execute passes userId, relationshipId, scope to dep', async () => {
    let captured: { userId?: string; relationshipId?: string; scope?: string } = {};
    const tool = createRemoveRelationshipTool({
      removeRelationship: async (userId, relId, scope) => {
        captured = { userId, relationshipId: relId, scope };
        return { ok: true, status: 200, data: { deleted: true } };
      },
    });

    const args = tool.parseArguments({ relationshipId });
    await tool.execute({ userId: 'user-2', scope: 'proj-1' }, args);

    assert.equal(captured.userId, 'user-2');
    assert.equal(captured.relationshipId, relationshipId);
    assert.equal(captured.scope, 'proj-1');
  });

  it('execute surfaces error results (e.g. read-only graph 403)', async () => {
    const tool = makeTool({ ok: false, status: 403, error: 'read-only graph' });
    const args = tool.parseArguments({ relationshipId });
    const result = await tool.execute({ userId: 'u1' }, args);
    assert.equal(result.ok, false);
    assert.equal((result as any).status, 403);
  });
});

describe('list_relationships tool', () => {
  function makeTool(result: ApiResult = { ok: true, status: 200, data: [] }) {
    return createListRelationshipsTool({
      listRelationships: async () => result,
    });
  }

  it('has correct metadata', () => {
    const tool = makeTool();
    assert.equal(tool.name, 'list_relationships');
    assert.equal(tool.inputSchema.required?.includes('projectId'), true);
    assert.equal(tool.inputSchema.required?.includes('kind') ?? false, false);
  });

  it('parseArguments accepts projectId alone and with kind', () => {
    const tool = makeTool();
    assert.doesNotThrow(() => tool.parseArguments({ projectId }));
    const withKind = tool.parseArguments({ projectId, kind: 'edge' }) as any;
    assert.equal(withKind.kind, 'edge');
  });

  it('parseArguments rejects an unknown kind', () => {
    const tool = makeTool();
    assert.throws(() => tool.parseArguments({ projectId, kind: 'friendship' }));
  });

  it('execute passes params through', async () => {
    let captured: unknown;
    const tool = createListRelationshipsTool({
      listRelationships: async (_userId, params) => {
        captured = params;
        return { ok: true, status: 200, data: [] };
      },
    });
    const args = tool.parseArguments({ projectId, kind: 'edge' });
    await tool.execute({ userId: 'u1' }, args);
    assert.deepEqual(captured, { projectId, kind: 'edge' });
  });
});

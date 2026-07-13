/**
 * SnapshotController unit tests — one RLS transaction returning the whole
 * per-project workspace ({ thoughts, relationships, labels }).
 */
import { BadRequestException } from '@nestjs/common';
import { SnapshotController } from '../../src/workspace/snapshot.controller';
import type { DatabaseService } from '../../src/database/database.service';

describe('SnapshotController', () => {
  const rowsByTable: Record<string, unknown[]> = {
    thoughts: [{ id: 't1' }],
    relationships: [{ id: 'r1', kind: 'hierarchy' }],
    labels: [{ id: 'l1' }],
  };

  const tx = {
    select: () => ({
      from: (table: Record<string, unknown>) => ({
        where: () =>
          Promise.resolve(rowsByTable[(table as any)[Symbol.for('drizzle:Name')] as string]),
      }),
    }),
  };

  function makeController() {
    const asUser = jest.fn((_userId: string, cb: (tx: unknown) => Promise<unknown>) => cb(tx));
    return { asUser, controller: new SnapshotController({ asUser } as unknown as DatabaseService) };
  }

  it('returns thoughts + relationships + labels from a single asUser transaction', async () => {
    const { asUser, controller } = makeController();

    const result = await controller.snapshot({ user: { userId: 'user-1' } }, 'proj-1');

    expect(asUser).toHaveBeenCalledTimes(1);
    expect(asUser).toHaveBeenCalledWith('user-1', expect.any(Function));
    expect(result).toEqual({
      thoughts: [{ id: 't1' }],
      relationships: [{ id: 'r1', kind: 'hierarchy' }],
      labels: [{ id: 'l1' }],
    });
  });

  it('rejects a missing projectId', () => {
    const { controller } = makeController();
    expect(() => controller.snapshot({ user: { userId: 'user-1' } }, undefined)).toThrow(
      BadRequestException,
    );
  });
});

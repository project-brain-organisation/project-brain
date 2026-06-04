/**
 * UsersService unit tests — port-to-port (UsersService driving port)
 *
 * Test Budget: 2 distinct behaviors × 2 = 4 max unit tests
 * Behaviors:
 *   B1: findById returns null when user not found
 *   B2: create inserts and returns user
 *
 * DatabaseService is mocked at the port boundary (driven port).
 * Internal Drizzle query chain is stubbed via a fluent mock.
 */

import { UsersService } from '../../src/users/users.service';

// ── Fluent Drizzle query chain mock helpers ────────────────────────

function makeSelectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.from = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockResolvedValue(rows);
  return chain;
}

function makeInsertChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.values = jest.fn().mockReturnValue(chain);
  chain.returning = jest.fn().mockResolvedValue(rows);
  return chain;
}

function makeDrizzleMock(overrides: { selectRows?: unknown[]; insertRows?: unknown[] } = {}) {
  const drizzle = {
    select: jest.fn().mockReturnValue(makeSelectChain(overrides.selectRows ?? [])),
    insert: jest.fn().mockReturnValue(makeInsertChain(overrides.insertRows ?? [])),
  };
  return { db: drizzle } as unknown as import('../../src/database/database.service').DatabaseService;
}

// ── Tests ──────────────────────────────────────────────────────────

describe('UsersService', () => {
  describe('findById', () => {
    it('returns null when no user row exists', async () => {
      const dbService = makeDrizzleMock({ selectRows: [] });
      const service = new UsersService(dbService);

      const result = await service.findById('non-existent-id');

      expect(result).toBeNull();
    });

    it('returns the user when a row is found', async () => {
      const user = { id: 'abc-123', username: 'Alice', createdAt: new Date(), updatedAt: new Date() };
      const dbService = makeDrizzleMock({ selectRows: [user] });
      const service = new UsersService(dbService);

      const result = await service.findById('abc-123');

      expect(result).toEqual(user);
    });
  });

  describe('create', () => {
    it('inserts user and returns the created row', async () => {
      const created = { id: 'xyz-789', username: 'Bob', createdAt: new Date(), updatedAt: new Date() };
      const dbService = makeDrizzleMock({ insertRows: [created] });
      const service = new UsersService(dbService);

      const result = await service.create({ username: 'Bob' });

      expect(result).toEqual(created);
      expect(dbService.db.insert).toHaveBeenCalled();
    });
  });
});

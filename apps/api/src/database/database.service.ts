import { Injectable } from '@nestjs/common';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle, NeonDatabase } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';
import ws from 'ws';
import * as schema from './schema/index';
import { tenantStorage } from './tenant-context';

neonConfig.webSocketConstructor = ws;

@Injectable()
export class DatabaseService {
  /** Runtime query pool — connects as app_user (or owner as fallback for local dev). */
  public readonly db: NeonDatabase<typeof schema>;
  /** Owner pool — used only for drizzle-kit migrations and admin operations. */
  public readonly ownerDb: NeonDatabase<typeof schema>;

  private readonly pool: Pool;
  private readonly appPool: Pool;

  constructor() {
    // Owner pool: full privileges for drizzle-kit / migrations only.
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
    // App pool: DML-only app_user role for all runtime queries.
    // Falls back to DATABASE_URL in local dev if DATABASE_URL_APP is absent.
    this.appPool = new Pool({
      connectionString: process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL,
    });

    this.ownerDb = drizzle(this.pool, { schema });
    // this.db is the public API consumed by all services — wired to appPool.
    this.db = drizzle(this.appPool, { schema });
  }

  /**
   * Run `cb` inside a transaction scoped to `userId`.
   *
   * Populates the AsyncLocalStorage store with `userId` and executes
   * `SET LOCAL app.current_user_id = <userId>` so that RLS policies can read
   * `current_setting('app.current_user_id', true)` within the same transaction.
   * The SET LOCAL is automatically cleared when the transaction ends.
   */
  async asUser<T>(
    userId: string,
    cb: (tx: NeonDatabase<typeof schema>) => Promise<T>,
  ): Promise<T> {
    return tenantStorage.run({ userId }, () =>
      this.db.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
        return cb(tx);
      }),
    );
  }

  /**
   * Run `cb` inside a transaction WITHOUT setting `app.current_user_id`.
   *
   * For background / gateway jobs that legitimately operate outside one tenant
   * context (e.g. JWT validation, credential lookups, event publication).
   */
  async asSystem<T>(
    cb: (tx: NeonDatabase<typeof schema>) => Promise<T>,
  ): Promise<T> {
    return tenantStorage.run({}, () =>
      this.db.transaction(async (tx) => {
        // Deliberately no set_config — system context.
        return cb(tx);
      }),
    );
  }

  /**
   * Return the userId stored in the current ALS context, or `undefined` when
   * running outside an `asUser` scope (system context or no active context).
   */
  static getCurrentUserId(): string | undefined {
    return tenantStorage.getStore()?.userId;
  }
}

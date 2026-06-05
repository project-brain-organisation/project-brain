import { Injectable } from '@nestjs/common';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle, NeonDatabase } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as schema from './schema/index';

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
}

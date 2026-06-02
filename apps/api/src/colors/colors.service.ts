import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { colors, thoughts } from '../database/schema';
import { eq, and } from 'drizzle-orm';

@Injectable()
export class ColorsService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(userId: string) {
    return this.db.db
      .select()
      .from(colors)
      .where(eq(colors.userId, userId));
  }

  async findOrCreate(userId: string, hex: string) {
    const [existing] = await this.db.db
      .select()
      .from(colors)
      .where(and(eq(colors.userId, userId), eq(colors.hex, hex)))
      .limit(1);
    if (existing) return existing;

    const [created] = await this.db.db
      .insert(colors)
      .values({ userId, hex })
      .returning();
    return created;
  }

  async setThoughtColor(userId: string, thoughtId: string, hex: string) {
    const color = await this.findOrCreate(userId, hex);
    const [updated] = await this.db.db
      .update(thoughts)
      .set({ colorId: color.id, updatedAt: new Date() })
      .where(and(eq(thoughts.id, thoughtId), eq(thoughts.userId, userId)))
      .returning();
    return updated;
  }

  async clearThoughtColor(userId: string, thoughtId: string) {
    const [updated] = await this.db.db
      .update(thoughts)
      .set({ colorId: null, updatedAt: new Date() })
      .where(and(eq(thoughts.id, thoughtId), eq(thoughts.userId, userId)))
      .returning();
    return updated;
  }

  async getThoughtColors(userId: string) {
    const rows = await this.db.db
      .select({
        thoughtId: thoughts.id,
        hex: colors.hex,
      })
      .from(thoughts)
      .innerJoin(colors, eq(thoughts.colorId, colors.id))
      .where(eq(thoughts.userId, userId));
    return rows;
  }
}

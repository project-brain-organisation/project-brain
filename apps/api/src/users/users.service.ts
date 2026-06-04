import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { users } from '../database/schema/index';
import { eq } from 'drizzle-orm';

export type User = typeof users.$inferSelect;

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  async findById(id: string): Promise<User | null> {
    const [user] = await this.db.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return user ?? null;
  }

  async create(data: { username: string }): Promise<User> {
    const [user] = await this.db.db
      .insert(users)
      .values({ username: data.username })
      .returning();
    return user;
  }
}

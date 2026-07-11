import { Injectable, ForbiddenException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { entities, projectMeta } from '../database/schema/index';

@Injectable()
export class ProjectsService {
  constructor(private readonly db: DatabaseService) {}

  async assertOwnership(userId: string, projectId: string): Promise<void> {
    const [meta] = await this.db.asUser(userId, (tx) =>
      tx.select().from(projectMeta).where(eq(projectMeta.id, projectId)).limit(1),
    );
    if (!meta || meta.ownerId !== userId) {
      throw new ForbiddenException('Project not found or access denied');
    }
  }

  async create(userId: string, data: { name: string; emoji?: string; isPublic?: boolean }) {
    return this.db.asUser(userId, async (tx) => {
      const id = crypto.randomUUID();
      await tx.insert(entities).values({ id, projectId: id, type: 'project' });
      const [meta] = await tx
        .insert(projectMeta)
        .values({
          id,
          ownerId: userId,
          name: data.name,
          emoji: data.emoji ?? null,
          isPublic: data.isPublic ?? false,
        })
        .returning();
      return meta;
    });
  }

  async findAllByUser(userId: string) {
    return this.db.asUser(userId, (tx) =>
      tx.select().from(projectMeta).where(eq(projectMeta.ownerId, userId)),
    );
  }

  async findOne(userId: string, projectId: string) {
    await this.assertOwnership(userId, projectId);
    const [meta] = await this.db.asUser(userId, (tx) =>
      tx.select().from(projectMeta).where(eq(projectMeta.id, projectId)).limit(1),
    );
    return meta;
  }

  async update(
    userId: string,
    projectId: string,
    data: Partial<{ name: string; emoji: string; isPublic: boolean }>,
  ) {
    await this.assertOwnership(userId, projectId);
    const [updated] = await this.db.asUser(userId, (tx) =>
      tx
        .update(projectMeta)
        .set({
          ...(data.name !== undefined && { name: data.name }),
          ...(data.emoji !== undefined && { emoji: data.emoji }),
          ...(data.isPublic !== undefined && { isPublic: data.isPublic }),
        })
        .where(eq(projectMeta.id, projectId))
        .returning(),
    );
    return updated;
  }

  async remove(userId: string, projectId: string) {
    await this.assertOwnership(userId, projectId);
    await this.db.asUser(userId, (tx) =>
      tx.delete(entities).where(eq(entities.id, projectId)),
    );
    return { deleted: true };
  }
}

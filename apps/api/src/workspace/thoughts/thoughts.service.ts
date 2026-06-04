import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { ProjectsService } from '../../projects/projects.service';
import { entities, thoughts } from '../../database/schema/index';
import { CreateThoughtDto } from './dto/create-thought.dto';

@Injectable()
export class ThoughtsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly projectsService: ProjectsService,
  ) {}

  async create(userId: string, dto: CreateThoughtDto) {
    await this.projectsService.assertOwnership(userId, dto.projectId);

    return this.db.db.transaction(async (tx) => {
      const id = crypto.randomUUID();

      const [entity] = await tx
        .insert(entities)
        .values({ id, projectId: dto.projectId, type: 'thought' })
        .returning();

      const [thought] = await tx
        .insert(thoughts)
        .values({
          id: entity.id,
          body: dto.body,
          title: dto.title ?? '',
          color: dto.color ?? null,
        })
        .returning();

      // TODO(04-02): emit WorkspaceEvent { type: 'thought.created', source: 'user', id }
      return thought;
    });
  }

  async findOne(userId: string, id: string) {
    const [entity] = await this.db.db
      .select()
      .from(entities)
      .where(eq(entities.id, id))
      .limit(1);

    if (!entity) {
      throw new NotFoundException(`Thought ${id} not found`);
    }

    await this.projectsService.assertOwnership(userId, entity.projectId);

    const [thought] = await this.db.db
      .select()
      .from(thoughts)
      .where(eq(thoughts.id, id))
      .limit(1);

    return thought;
  }

  async setColor(userId: string, id: string, color: string) {
    await this.findOne(userId, id);

    const [updated] = await this.db.db
      .update(thoughts)
      .set({ color })
      .where(eq(thoughts.id, id))
      .returning();

    // TODO(04-02): emit WorkspaceEvent { type: 'thought.updated', source: 'user', id }
    return updated;
  }

  async clearColor(userId: string, id: string) {
    await this.findOne(userId, id);

    const [updated] = await this.db.db
      .update(thoughts)
      .set({ color: null })
      .where(eq(thoughts.id, id))
      .returning();

    // TODO(04-02): emit WorkspaceEvent { type: 'thought.updated', source: 'user', id }
    return updated;
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);

    await this.db.db.delete(entities).where(eq(entities.id, id));

    // TODO(04-02): emit WorkspaceEvent { type: 'thought.deleted', source: 'user', id }
    return { deleted: true };
  }
}

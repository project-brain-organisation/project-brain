import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { ProjectsService } from '../../projects/projects.service';
import { PipelineService } from '../pipeline/pipeline.service';
import { WorkspaceEventsService } from '../gateway/workspace-events.service';
import { entities, thoughts } from '../../database/schema/index';
import { CreateThoughtDto } from './dto/create-thought.dto';

@Injectable()
export class ThoughtsService {
  private readonly logger = new Logger(ThoughtsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly projectsService: ProjectsService,
    private readonly pipelineService: PipelineService,
    private readonly workspaceEvents: WorkspaceEventsService,
  ) {}

  async create(userId: string, dto: CreateThoughtDto, source: 'user' | 'mcp' = 'user') {
    await this.projectsService.assertOwnership(userId, dto.projectId);

    const thought = await this.db.db.transaction(async (tx) => {
      const id = crypto.randomUUID();

      await tx
        .insert(entities)
        .values({ id, projectId: dto.projectId, type: 'thought' })
        .returning();

      const [row] = await tx
        .insert(thoughts)
        .values({
          id,
          projectId: dto.projectId,
          ownerId: userId,
          body: dto.body,
          title: dto.title ?? '',
          color: dto.color ?? null,
        })
        .returning();

      return row;
    });

    this.workspaceEvents.publish(userId, {
      eventId: crypto.randomUUID(),
      type: 'thought.created',
      source,
      resourceId: thought.id,
      projectId: dto.projectId,
      timestamp: new Date().toISOString(),
    });

    // Fire-and-forget chunk+embed scoped to the owning project (async/background).
    if (dto.body) {
      this.pipelineService
        .chunkAndEmbed(dto.projectId, thought.id, dto.body, userId)
        .catch((err) =>
          this.logger.warn(`Chunk/embed failed for thought ${thought.id}: ${err.message}`),
        );
    }

    return thought;
  }

  async updateBody(userId: string, id: string, body: string, source: 'user' | 'mcp' = 'user') {
    const [thought] = await this.db.db
      .select()
      .from(thoughts)
      .where(eq(thoughts.id, id))
      .limit(1);

    if (!thought) {
      throw new NotFoundException(`Thought ${id} not found`);
    }

    // Ownership isolation is enforced by RLS (using clause on thoughts table).
    // assertOwnership removed — RLS makes unauthorized rows invisible, so
    // the NotFoundException above fires for both missing and unauthorized rows.

    const [updated] = await this.db.db
      .update(thoughts)
      .set({ body })
      .where(eq(thoughts.id, id))
      .returning();

    // Re-chunk + re-embed on body edit (async/background, project-scoped).
    this.pipelineService
      .rechunk(thought.projectId, id, body, userId)
      .catch((err) =>
        this.logger.warn(`Re-chunk/embed failed for thought ${id}: ${err.message}`),
      );

    this.workspaceEvents.publish(userId, {
      eventId: crypto.randomUUID(),
      type: 'thought.updated',
      source,
      resourceId: id,
      projectId: thought.projectId,
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  async semanticSearch(userId: string, projectId: string, query: string, n?: number) {
    return this.pipelineService.semanticSearch(userId, projectId, query, n);
  }

  async findByProject(userId: string, projectId: string) {
    // Ownership isolation is enforced by RLS — only rows owned by the current
    // user are visible; assertOwnership removed (redundant on this read path).
    return this.db.db
      .select()
      .from(thoughts)
      .where(eq(thoughts.projectId, projectId));
  }

  async findOne(userId: string, id: string) {
    const [thought] = await this.db.db
      .select()
      .from(thoughts)
      .where(eq(thoughts.id, id))
      .limit(1);

    if (!thought) {
      throw new NotFoundException(`Thought ${id} not found`);
    }

    // Ownership isolation is enforced by RLS — unauthorized rows are not visible,
    // so NotFoundException above covers both missing and cross-tenant access.

    return thought;
  }

  async setColor(userId: string, id: string, color: string, source: 'user' | 'mcp' = 'user') {
    const [thought] = await this.db.db
      .select()
      .from(thoughts)
      .where(eq(thoughts.id, id))
      .limit(1);

    if (!thought) throw new NotFoundException(`Thought ${id} not found`);
    // RLS using clause makes unauthorized rows invisible; assertOwnership removed.

    const [updated] = await this.db.db
      .update(thoughts)
      .set({ color })
      .where(eq(thoughts.id, id))
      .returning();

    this.workspaceEvents.publish(userId, {
      eventId: crypto.randomUUID(),
      type: 'thought.updated',
      source,
      resourceId: id,
      projectId: thought.projectId,
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  async clearColor(userId: string, id: string, source: 'user' | 'mcp' = 'user') {
    const [thought] = await this.db.db
      .select()
      .from(thoughts)
      .where(eq(thoughts.id, id))
      .limit(1);

    if (!thought) throw new NotFoundException(`Thought ${id} not found`);
    // RLS using clause makes unauthorized rows invisible; assertOwnership removed.

    const [updated] = await this.db.db
      .update(thoughts)
      .set({ color: null })
      .where(eq(thoughts.id, id))
      .returning();

    this.workspaceEvents.publish(userId, {
      eventId: crypto.randomUUID(),
      type: 'thought.updated',
      source,
      resourceId: id,
      projectId: thought.projectId,
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  async remove(userId: string, id: string, source: 'user' | 'mcp' = 'user') {
    const [thought] = await this.db.db
      .select()
      .from(thoughts)
      .where(eq(thoughts.id, id))
      .limit(1);

    if (!thought) {
      throw new NotFoundException(`Thought ${id} not found`);
    }

    // RLS using clause makes unauthorized rows invisible; assertOwnership removed.

    await this.db.db.delete(entities).where(eq(entities.id, id));

    this.workspaceEvents.publish(userId, {
      eventId: crypto.randomUUID(),
      type: 'thought.deleted',
      source,
      resourceId: id,
      projectId: thought.projectId,
      timestamp: new Date().toISOString(),
    });

    return { deleted: true };
  }
}

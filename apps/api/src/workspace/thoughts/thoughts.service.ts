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

    const thought = await this.db.asUser(userId, async (tx) => {
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
          canvasX: dto.canvasX ?? null,
          canvasY: dto.canvasY ?? null,
          width: dto.width ?? null,
          height: dto.height ?? null,
        })
        .returning();

      return row;
    });

    this.workspaceEvents.emit(userId, 'thought.created', {
      source,
      resourceId: thought.id,
      projectId: dto.projectId,
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

  async update(
    userId: string,
    id: string,
    patch: {
      body?: string;
      title?: string;
      color?: string | null;
      canvasX?: number | null;
      canvasY?: number | null;
      width?: number | null;
      height?: number | null;
    },
    source: 'user' | 'mcp' = 'user',
  ) {
    const thought = await this.findOne(userId, id);

    const [updated] = await this.db.asUser(userId, async (tx) =>
      tx
        .update(thoughts)
        .set({
          ...(patch.body !== undefined && { body: patch.body }),
          ...(patch.title !== undefined && { title: patch.title }),
          ...(patch.color !== undefined && { color: patch.color }),
          ...(patch.canvasX !== undefined && { canvasX: patch.canvasX }),
          ...(patch.canvasY !== undefined && { canvasY: patch.canvasY }),
          ...(patch.width !== undefined && { width: patch.width }),
          ...(patch.height !== undefined && { height: patch.height }),
        })
        .where(eq(thoughts.id, id))
        .returning(),
    );

    // Re-chunk + re-embed only when the body text actually changed.
    if (patch.body !== undefined && patch.body !== thought.body) {
      this.pipelineService
        .rechunk(thought.projectId, id, patch.body, userId)
        .catch((err) =>
          this.logger.warn(`Re-chunk/embed failed for thought ${id}: ${err.message}`),
        );
    }

    this.workspaceEvents.emit(userId, 'thought.updated', {
      source,
      resourceId: id,
      projectId: thought.projectId,
    });

    return updated;
  }

  async semanticSearch(userId: string, projectId: string | undefined, query: string, n?: number) {
    return this.pipelineService.semanticSearch(userId, projectId, query, n);
  }

  async findByProject(userId: string, projectId: string) {
    // Ownership isolation is enforced by RLS — only rows owned by the current
    // user are visible on this read path.
    return this.db.asUser(userId, async (tx) =>
      tx
        .select()
        .from(thoughts)
        .where(eq(thoughts.projectId, projectId)),
    );
  }

  async findOne(userId: string, id: string) {
    // Ownership isolation is enforced by RLS — unauthorized rows are invisible,
    // so the 404 below covers both missing and cross-tenant ids. Mutators lean
    // on this by loading through findOne before writing.
    const thought = await this.db.asUser(userId, async (tx) => {
      const [row] = await tx
        .select()
        .from(thoughts)
        .where(eq(thoughts.id, id))
        .limit(1);
      return row;
    });

    if (!thought) {
      throw new NotFoundException(`Thought ${id} not found`);
    }

    return thought;
  }

  async remove(userId: string, id: string, source: 'user' | 'mcp' = 'user') {
    const thought = await this.findOne(userId, id);

    await this.db.asUser(userId, async (tx) =>
      tx.delete(entities).where(eq(entities.id, id)),
    );

    this.workspaceEvents.emit(userId, 'thought.deleted', {
      source,
      resourceId: id,
      projectId: thought.projectId,
    });

    return { deleted: true };
  }
}

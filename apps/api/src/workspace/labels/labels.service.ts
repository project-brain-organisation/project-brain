import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { ProjectsService } from '../../projects/projects.service';
import { WorkspaceEventsService } from '../gateway/workspace-events.service';
import { entities, labels } from '../../database/schema/index';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';

@Injectable()
export class LabelsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly projectsService: ProjectsService,
    private readonly workspaceEvents: WorkspaceEventsService,
  ) {}

  async create(userId: string, dto: CreateLabelDto, source: 'user' | 'mcp' = 'user') {
    await this.projectsService.assertOwnership(userId, dto.projectId);

    const label = await this.db.asUser(userId, async (tx) => {
      const id = crypto.randomUUID();

      await tx
        .insert(entities)
        .values({ id, projectId: dto.projectId, type: 'label' })
        .returning();

      const [row] = await tx
        .insert(labels)
        .values({
          id,
          projectId: dto.projectId,
          ownerId: userId,
          name: dto.name,
          color: dto.color ?? '#999999',
          isEdge: dto.isEdge ?? false,
        })
        .returning();

      return row;
    });

    this.workspaceEvents.emit(userId, 'label.created', {
      source,
      resourceId: label.id,
      projectId: dto.projectId,
    });

    return label;
  }

  async findByProject(userId: string, projectId: string) {
    // Ownership isolation is enforced by RLS — only rows owned by the current
    // user are visible on this read path.
    return this.db.asUser(userId, async (tx) =>
      tx
        .select()
        .from(labels)
        .where(eq(labels.projectId, projectId)),
    );
  }

  async findOne(userId: string, id: string) {
    // Ownership isolation is enforced by RLS — unauthorized rows are invisible,
    // so the 404 below covers both missing and cross-tenant ids. Mutators lean
    // on this by loading through findOne before writing.
    const label = await this.db.asUser(userId, async (tx) => {
      const [row] = await tx
        .select()
        .from(labels)
        .where(eq(labels.id, id))
        .limit(1);
      return row;
    });

    if (!label) {
      throw new NotFoundException(`Label ${id} not found`);
    }

    return label;
  }

  async update(userId: string, id: string, dto: UpdateLabelDto, source: 'user' | 'mcp' = 'user') {
    const label = await this.findOne(userId, id);

    const [updated] = await this.db.asUser(userId, async (tx) =>
      tx
        .update(labels)
        .set({
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.color !== undefined && { color: dto.color }),
          ...(dto.isEdge !== undefined && { isEdge: dto.isEdge }),
        })
        .where(eq(labels.id, id))
        .returning(),
    );

    this.workspaceEvents.emit(userId, 'label.updated', {
      source,
      resourceId: id,
      projectId: label.projectId,
    });

    return updated;
  }

  async remove(userId: string, id: string, source: 'user' | 'mcp' = 'user') {
    const label = await this.findOne(userId, id);

    await this.db.asUser(userId, async (tx) =>
      tx.delete(entities).where(eq(entities.id, id)),
    );

    this.workspaceEvents.emit(userId, 'label.deleted', {
      source,
      resourceId: id,
      projectId: label.projectId,
    });

    return { deleted: true };
  }
}

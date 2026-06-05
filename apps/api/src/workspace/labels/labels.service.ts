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

    const label = await this.db.db.transaction(async (tx) => {
      const id = crypto.randomUUID();

      await tx
        .insert(entities)
        .values({ id, projectId: dto.projectId, type: 'label' })
        .returning();

      const [row] = await tx
        .insert(labels)
        .values({
          id,
          name: dto.name,
          color: dto.color ?? '#999999',
          isEdge: dto.isEdge ?? false,
        })
        .returning();

      return row;
    });

    this.workspaceEvents.publish(userId, {
      eventId: crypto.randomUUID(),
      type: 'label.created',
      source,
      resourceId: label.id,
      projectId: dto.projectId,
      timestamp: new Date().toISOString(),
    });

    return label;
  }

  async findByProject(userId: string, projectId: string) {
    await this.projectsService.assertOwnership(userId, projectId);

    return this.db.db
      .select()
      .from(labels)
      .innerJoin(entities, eq(labels.id, entities.id))
      .where(eq(entities.projectId, projectId));
  }

  async findOne(userId: string, id: string) {
    const [entity] = await this.db.db
      .select()
      .from(entities)
      .where(eq(entities.id, id))
      .limit(1);

    if (!entity) {
      throw new NotFoundException(`Label ${id} not found`);
    }

    await this.projectsService.assertOwnership(userId, entity.projectId);

    const [label] = await this.db.db
      .select()
      .from(labels)
      .where(eq(labels.id, id))
      .limit(1);

    return label;
  }

  async update(userId: string, id: string, dto: UpdateLabelDto, source: 'user' | 'mcp' = 'user') {
    const [entity] = await this.db.db
      .select()
      .from(entities)
      .where(eq(entities.id, id))
      .limit(1);

    if (!entity) throw new NotFoundException(`Label ${id} not found`);
    await this.projectsService.assertOwnership(userId, entity.projectId);

    const [updated] = await this.db.db
      .update(labels)
      .set({
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.isEdge !== undefined && { isEdge: dto.isEdge }),
      })
      .where(eq(labels.id, id))
      .returning();

    this.workspaceEvents.publish(userId, {
      eventId: crypto.randomUUID(),
      type: 'label.updated',
      source,
      resourceId: id,
      projectId: entity.projectId,
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  async remove(userId: string, id: string, source: 'user' | 'mcp' = 'user') {
    const [entity] = await this.db.db
      .select()
      .from(entities)
      .where(eq(entities.id, id))
      .limit(1);

    if (!entity) throw new NotFoundException(`Label ${id} not found`);
    await this.projectsService.assertOwnership(userId, entity.projectId);

    await this.db.db.delete(entities).where(eq(entities.id, id));

    this.workspaceEvents.publish(userId, {
      eventId: crypto.randomUUID(),
      type: 'label.deleted',
      source,
      resourceId: id,
      projectId: entity.projectId,
      timestamp: new Date().toISOString(),
    });

    return { deleted: true };
  }
}

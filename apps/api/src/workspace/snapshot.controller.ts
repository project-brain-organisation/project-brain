import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { eq, getTableColumns } from 'drizzle-orm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DatabaseService } from '../database/database.service';
import { entities, labels, relationships, thoughts } from '../database/schema/index';

/**
 * One-request project workspace load: thoughts + relationships + labels in a
 * single RLS transaction, replacing five separate GETs from the SPA.
 * Ownership isolation is enforced by RLS on every select.
 */
@Controller('workspace/snapshot')
@UseGuards(JwtAuthGuard)
export class SnapshotController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  snapshot(@Req() req: any, @Query('projectId') projectId?: string) {
    if (!projectId) {
      throw new BadRequestException('projectId query parameter is required');
    }
    return this.db.asUser(req.user.userId, async (tx) => ({
      // Timestamps live on the entities supertype row (TPT), not on thoughts.
      thoughts: await tx
        .select({ ...getTableColumns(thoughts), createdAt: entities.createdAt, updatedAt: entities.updatedAt })
        .from(thoughts)
        .innerJoin(entities, eq(entities.id, thoughts.id))
        .where(eq(thoughts.projectId, projectId)),
      relationships: await tx.select().from(relationships).where(eq(relationships.projectId, projectId)),
      labels: await tx.select().from(labels).where(eq(labels.projectId, projectId)),
    }));
  }
}

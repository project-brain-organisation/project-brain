import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { labels, thoughtLabels, thoughts } from '../database/schema';
import { eq, and, isNull } from 'drizzle-orm';

@Injectable()
export class LabelsService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(userId: string, projectId?: string) {
    const conditions = [eq(labels.userId, userId)];
    if (projectId) {
      conditions.push(eq(labels.projectId, projectId));
    } else {
      conditions.push(isNull(labels.projectId));
    }
    return this.db.db
      .select()
      .from(labels)
      .where(and(...conditions));
  }

  async create(userId: string, name: string, color?: string, projectId?: string) {
    const [label] = await this.db.db
      .insert(labels)
      .values({ userId, name, ...(color ? { color } : {}), ...(projectId ? { projectId } : {}) })
      .returning();
    return label;
  }

  async update(userId: string, labelId: string, data: { name?: string; color?: string; isEdge?: boolean }) {
    const [label] = await this.db.db
      .update(labels)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(labels.id, labelId), eq(labels.userId, userId)))
      .returning();
    if (!label) throw new NotFoundException('Label not found');
    return label;
  }

  async remove(userId: string, labelId: string) {
    const [label] = await this.db.db
      .delete(labels)
      .where(and(eq(labels.id, labelId), eq(labels.userId, userId)))
      .returning();
    if (!label) throw new NotFoundException('Label not found');
    return label;
  }

  async findByThought(thoughtId: string) {
    const rows = await this.db.db
      .select({
        id: labels.id,
        name: labels.name,
        color: labels.color,
        isEdge: labels.isEdge,
        thoughtLabelId: thoughtLabels.id,
        createdAt: labels.createdAt,
        updatedAt: labels.updatedAt,
      })
      .from(thoughtLabels)
      .innerJoin(labels, eq(thoughtLabels.labelId, labels.id))
      .where(eq(thoughtLabels.thoughtId, thoughtId));
    return rows;
  }

  async assignLabel(userId: string, thoughtId: string, labelId: string) {
    const existing = await this.db.db
      .select()
      .from(thoughtLabels)
      .where(
        and(
          eq(thoughtLabels.thoughtId, thoughtId),
          eq(thoughtLabels.labelId, labelId),
        ),
      )
      .limit(1);
    if (existing.length > 0) return existing[0];

    const [row] = await this.db.db
      .insert(thoughtLabels)
      .values({ userId, thoughtId, labelId })
      .returning();
    return row;
  }

  async findEdgeAssignments(userId: string) {
    return this.db.db
      .select({
        thoughtId: thoughtLabels.thoughtId,
        labelId: labels.id,
      })
      .from(thoughtLabels)
      .innerJoin(labels, eq(thoughtLabels.labelId, labels.id))
      .innerJoin(thoughts, eq(thoughtLabels.thoughtId, thoughts.id))
      .where(and(eq(labels.isEdge, true), eq(thoughts.userId, userId)));
  }

  async unassignLabel(thoughtId: string, labelId: string) {
    const [row] = await this.db.db
      .delete(thoughtLabels)
      .where(
        and(
          eq(thoughtLabels.thoughtId, thoughtId),
          eq(thoughtLabels.labelId, labelId),
        ),
      )
      .returning();
    if (!row) throw new NotFoundException('Label assignment not found');
    return row;
  }
}

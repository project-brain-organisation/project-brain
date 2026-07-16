import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { ProjectsService } from '../projects/projects.service';
import { ThoughtsService } from '../workspace/thoughts/thoughts.service';
import { LabelsService } from '../workspace/labels/labels.service';
import { RelationshipsService } from '../workspace/relationships/relationships.service';
import { McpInternalGuard } from './mcp-internal.guard';
import { chunks, labels, relationships } from '../database/schema/index';

@Controller('internal/mcp')
@UseGuards(McpInternalGuard)
export class InternalMcpController {
  constructor(
    private readonly thoughtsService: ThoughtsService,
    private readonly labelsService: LabelsService,
    private readonly relationshipsService: RelationshipsService,
    private readonly db: DatabaseService,
    private readonly projectsService: ProjectsService,
  ) {}

  private userIdFromHeaders(req: Request): string {
    const userIdHeader = req.header('x-mcp-user-id');
    if (!userIdHeader) {
      throw new UnauthorizedException('Missing x-mcp-user-id header');
    }
    return userIdHeader;
  }

  @Post('list-projects')
  listProjects(@Req() req: Request) {
    const userId = this.userIdFromHeaders(req);
    // Includes subscribed public graphs, each tagged role: 'owner' | 'subscriber'
    // so the MCP tool can mark subscribed graphs read-only. Reads work through
    // RLS public_read; writes are rejected with READ_ONLY_GRAPH_MESSAGE.
    return this.projectsService.findAllByUser(userId);
  }

  @Post('create-project')
  createProject(
    @Req() req: Request,
    @Body() body: { name: string; emoji?: string },
  ) {
    const userId = this.userIdFromHeaders(req);
    return this.projectsService.create(userId, { name: body.name, emoji: body.emoji }, 'mcp');
  }

  @Get('thought/:thoughtId')
  getThought(@Req() req: Request, @Param('thoughtId') thoughtId: string) {
    const userId = this.userIdFromHeaders(req);
    return this.thoughtsService.findOne(userId, thoughtId);
  }

  @Post('list-thoughts')
  listThoughts(
    @Req() req: Request,
    @Body() body: { projectId: string },
  ) {
    const userId = this.userIdFromHeaders(req);
    return this.thoughtsService.findByProject(userId, body.projectId);
  }

  @Post('batch-create-thoughts')
  batchCreateThoughts(
    @Req() req: Request,
    @Body()
    body: {
      projectId: string;
      thoughts: { ref?: string; body: string; title?: string; parentRef?: string; parentId?: string }[];
    },
  ) {
    const userId = this.userIdFromHeaders(req);
    return this.thoughtsService.createBatch(userId, body.projectId, body.thoughts, 'mcp');
  }

  @Post('edit-thought')
  editThought(
    @Req() req: Request,
    @Body() body: { thoughtId: string; body: string },
  ) {
    const userId = this.userIdFromHeaders(req);
    return this.thoughtsService.update(userId, body.thoughtId, { body: body.body }, 'mcp');
  }

  @Post('remove-thought')
  removeThought(@Req() req: Request, @Body() body: { thoughtId: string }) {
    const userId = this.userIdFromHeaders(req);
    return this.thoughtsService.remove(userId, body.thoughtId, 'mcp');
  }

  @Post('remember')
  remember(
    @Req() req: Request,
    @Body() body: { query: string; projectId?: string; n?: number },
  ) {
    const userId = this.userIdFromHeaders(req);
    return this.thoughtsService.semanticSearch(userId, body.projectId, body.query, body.n ?? 5);
  }

  @Get('elaborate/:chunkId')
  async elaborate(@Req() req: Request, @Param('chunkId') chunkId: string) {
    const userId = this.userIdFromHeaders(req);

    // RLS: relationships/chunks reads must run inside asUser() so
    // app.current_user_id is set; a bare db.db query fails the policy cast.
    const [chunk] = await this.db.asUser(userId, async (tx) =>
      tx
        .select({
          chunkId: chunks.id,
          chunkBody: chunks.body,
          chunkIndex: chunks.chunkIndex,
          thoughtId: chunks.thoughtId,
          projectId: chunks.projectId,
        })
        .from(chunks)
        .where(eq(chunks.id, chunkId))
        .limit(1),
    );

    if (!chunk) {
      throw new BadRequestException('Chunk not found');
    }

    const thought = await this.thoughtsService.findOne(userId, chunk.thoughtId);

    // Parent via hierarchy: source=child → target=parent
    const [parentRel] = await this.db.asUser(userId, async (tx) =>
      tx
        .select()
        .from(relationships)
        .where(and(eq(relationships.sourceId, chunk.thoughtId), eq(relationships.kind, 'hierarchy')))
        .limit(1),
    );

    const parent = parentRel
      ? await this.thoughtsService.findOne(userId, parentRel.targetId)
      : null;

    let siblings: unknown[] = [];
    if (parentRel) {
      const siblingRels = await this.db.asUser(userId, async (tx) =>
        tx
          .select()
          .from(relationships)
          .where(and(eq(relationships.targetId, parentRel.targetId), eq(relationships.kind, 'hierarchy'))),
      );
      siblings = await Promise.all(
        siblingRels
          .filter((r) => r.sourceId !== chunk.thoughtId)
          .map((r) => this.thoughtsService.findOne(userId, r.sourceId)),
      );
    }

    return {
      chunk: {
        id: chunk.chunkId,
        body: chunk.chunkBody,
        chunkIndex: chunk.chunkIndex,
        thoughtId: chunk.thoughtId,
      },
      thought,
      parent,
      siblings,
    };
  }

  @Get('thought-to-prompt/:thoughtId')
  async thoughtToPrompt(@Req() req: Request, @Param('thoughtId') thoughtId: string) {
    const userId = this.userIdFromHeaders(req);

    const thought = await this.thoughtsService.findOne(userId, thoughtId);

    // Parent via hierarchy (asUser: RLS needs app.current_user_id set)
    const [parentRel] = await this.db.asUser(userId, async (tx) =>
      tx
        .select()
        .from(relationships)
        .where(and(eq(relationships.sourceId, thoughtId), eq(relationships.kind, 'hierarchy')))
        .limit(1),
    );

    const parent = parentRel
      ? await this.thoughtsService.findOne(userId, parentRel.targetId)
      : null;

    // Children: thoughts whose hierarchy target = thoughtId
    const childRels = await this.db.asUser(userId, async (tx) =>
      tx
        .select()
        .from(relationships)
        .where(and(eq(relationships.targetId, thoughtId), eq(relationships.kind, 'hierarchy'))),
    );

    const children = await Promise.all(
      childRels.map((r) => this.thoughtsService.findOne(userId, r.sourceId)),
    );

    // Labels via tag relationships: source=thought → target=label
    const labelRows = (
      await this.db.asUser(userId, async (tx) => {
        const tagRels = await tx
          .select()
          .from(relationships)
          .where(and(eq(relationships.sourceId, thoughtId), eq(relationships.kind, 'tag')));

        const rows = [];
        for (const r of tagRels) {
          const [label] = await tx
            .select()
            .from(labels)
            .where(eq(labels.id, r.targetId))
            .limit(1);
          rows.push(label);
        }
        return rows;
      })
    ).filter(Boolean);

    const promptParts: string[] = ['Thought Context'];
    promptParts.push(`Title: ${thought.title || '(untitled)'}`);
    promptParts.push(`Body: ${thought.body || '(empty)'}`);

    if (parent) {
      promptParts.push('Parent Thought');
      promptParts.push(`Title: ${parent.title || '(untitled)'}`);
      promptParts.push(`Body: ${parent.body || '(empty)'}`);
    }

    if (children.length > 0) {
      promptParts.push('Children');
      for (const child of children) {
        promptParts.push(`- ${child.title || '(untitled)'}: ${child.body || '(empty)'}`);
      }
    }

    if (labelRows.length > 0) {
      promptParts.push('Labels');
      for (const label of labelRows) {
        promptParts.push(`- ${label.name} (${label.color})${label.isEdge ? ' [edge]' : ''}`);
      }
    }

    return {
      thought,
      parent,
      children,
      labels: labelRows,
      prompt: promptParts.join('\n'),
    };
  }

  @Post('list-labels')
  listLabels(@Req() req: Request, @Body() body: { projectId: string }) {
    const userId = this.userIdFromHeaders(req);
    return this.labelsService.findByProject(userId, body.projectId);
  }

  @Post('create-label')
  createLabel(
    @Req() req: Request,
    @Body() body: { name: string; color?: string; projectId: string },
  ) {
    const userId = this.userIdFromHeaders(req);
    return this.labelsService.create(
      userId,
      { name: body.name, color: body.color, projectId: body.projectId },
      'mcp',
    );
  }

  @Post('update-label')
  updateLabel(
    @Req() req: Request,
    @Body() body: { labelId: string; name?: string; color?: string; isEdge?: boolean },
  ) {
    const userId = this.userIdFromHeaders(req);
    return this.labelsService.update(
      userId,
      body.labelId,
      { name: body.name, color: body.color, isEdge: body.isEdge },
      'mcp',
    );
  }

  @Post('remove-label')
  removeLabel(@Req() req: Request, @Body() body: { labelId: string }) {
    const userId = this.userIdFromHeaders(req);
    return this.labelsService.remove(userId, body.labelId, 'mcp');
  }

  @Post('batch-add-labels')
  batchAddLabels(
    @Req() req: Request,
    @Body() body: { projectId: string; assignments: { thoughtId: string; labelId: string }[] },
  ) {
    const userId = this.userIdFromHeaders(req);
    return this.relationshipsService.createBatch(
      userId,
      body.projectId,
      body.assignments.map((a) => ({ sourceId: a.thoughtId, targetId: a.labelId, kind: 'tag' as const })),
      'mcp',
    );
  }

  @Post('remove-label-from-thought')
  async removeLabelFromThought(
    @Req() req: Request,
    @Body() body: { thoughtId: string; labelId: string },
  ) {
    const userId = this.userIdFromHeaders(req);

    const [rel] = await this.db.asUser(userId, async (tx) =>
      tx
        .select()
        .from(relationships)
        .where(
          and(
            eq(relationships.sourceId, body.thoughtId),
            eq(relationships.targetId, body.labelId),
            eq(relationships.kind, 'tag'),
          ),
        )
        .limit(1),
    );

    if (!rel) {
      throw new NotFoundException('Tag relationship not found');
    }

    return this.relationshipsService.remove(userId, rel.id, 'mcp');
  }

  @Get('thought-labels/:thoughtId')
  async getThoughtLabels(@Req() req: Request, @Param('thoughtId') thoughtId: string) {
    const userId = this.userIdFromHeaders(req);

    // Ownership verified via findOne
    await this.thoughtsService.findOne(userId, thoughtId);

    return (
      await this.db.asUser(userId, async (tx) => {
        const tagRels = await tx
          .select()
          .from(relationships)
          .where(and(eq(relationships.sourceId, thoughtId), eq(relationships.kind, 'tag')));

        const rows = [];
        for (const r of tagRels) {
          const [label] = await tx
            .select()
            .from(labels)
            .where(eq(labels.id, r.targetId))
            .limit(1);
          rows.push(label);
        }
        return rows;
      })
    ).filter(Boolean);
  }

  @Post('batch-create-relationships')
  async batchCreateRelationships(
    @Req() req: Request,
    @Body()
    body: { projectId: string; relationships: { sourceId: string; targetId: string; labelId: string }[] },
  ) {
    const userId = this.userIdFromHeaders(req);

    // Mirror the web dialog's rule: explicit relationships carry an edge label
    for (const labelId of new Set(body.relationships.map((r) => r.labelId))) {
      const label = await this.labelsService.findOne(userId, labelId);
      if (label.projectId !== body.projectId) {
        throw new BadRequestException(`Label ${labelId} belongs to a different project`);
      }
      if (!label.isEdge) {
        throw new BadRequestException(
          `Label ${labelId} must be an edge label (isEdge = true); promote it with set-label-edge first`,
        );
      }
    }

    return this.relationshipsService.createBatch(
      userId,
      body.projectId,
      body.relationships.map((r) => ({ ...r, kind: 'edge' as const })),
      'mcp',
    );
  }

  @Post('remove-relationship')
  removeRelationship(@Req() req: Request, @Body() body: { relationshipId: string }) {
    const userId = this.userIdFromHeaders(req);
    return this.relationshipsService.remove(userId, body.relationshipId, 'mcp');
  }

  @Post('list-relationships')
  listRelationships(
    @Req() req: Request,
    @Body() body: { projectId: string; kind?: 'hierarchy' | 'tag' | 'edge' },
  ) {
    const userId = this.userIdFromHeaders(req);
    return this.relationshipsService.findByProject(userId, body.projectId, body.kind);
  }

  @Post('set-label-edge')
  setLabelEdge(
    @Req() req: Request,
    @Body() body: { labelId: string; isEdge: boolean },
  ) {
    const userId = this.userIdFromHeaders(req);
    return this.labelsService.update(userId, body.labelId, { isEdge: body.isEdge }, 'mcp');
  }

  @Post('set-thought-color')
  setThoughtColor(
    @Req() req: Request,
    @Body() body: { thoughtId: string; hex: string },
  ) {
    const userId = this.userIdFromHeaders(req);
    return this.thoughtsService.update(userId, body.thoughtId, { color: body.hex }, 'mcp');
  }

  @Post('clear-thought-color')
  clearThoughtColor(@Req() req: Request, @Body() body: { thoughtId: string }) {
    const userId = this.userIdFromHeaders(req);
    return this.thoughtsService.update(userId, body.thoughtId, { color: null }, 'mcp');
  }
}

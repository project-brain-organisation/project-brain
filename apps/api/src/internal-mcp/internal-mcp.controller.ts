import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { ColorsService } from '../colors/colors.service';
import { DatabaseService } from '../database/database.service';
import { chunks, thoughts } from '../database/schema';
import { LabelsService } from '../labels/labels.service';
import { McpEventsService, type McpToolEvent } from '../mcp-events/mcp-events.service';
import { ThoughtsService } from '../thoughts/thoughts.service';
import { McpInternalGuard } from './mcp-internal.guard';

@Controller('internal/mcp')
@UseGuards(McpInternalGuard)
export class InternalMcpController {
  constructor(
    private readonly thoughtsService: ThoughtsService,
    private readonly labelsService: LabelsService,
    private readonly colorsService: ColorsService,
    private readonly db: DatabaseService,
    private readonly mcpEvents: McpEventsService,
  ) {}

  private userIdFromHeaders(req: Request): string {
    const userIdHeader = req.header('x-mcp-user-id');
    if (!userIdHeader) {
      throw new UnauthorizedException('Missing x-mcp-user-id header');
    }

    return userIdHeader;
  }

  private emit(
    userId: string,
    toolName: string,
    category: McpToolEvent['category'],
    operation: McpToolEvent['operation'],
    resourceIds?: Record<string, string>,
  ) {
    this.mcpEvents.publishToolEvent(userId, {
      eventId: randomUUID(),
      toolName,
      category,
      operation,
      timestamp: new Date().toISOString(),
      resourceIds,
    });
  }

  @Post('list-projects')
  listProjects(@Req() req: Request) {
    const userId = this.userIdFromHeaders(req);
    return this.thoughtsService.findRoots(userId);
  }

  @Post('create-project')
  async createProject(
    @Req() req: Request,
    @Body() body: { title: string; body?: string },
  ) {
    const userId = this.userIdFromHeaders(req);
    const result = await this.thoughtsService.create(userId, {
      title: body.title,
      body: body.body,
      isRoot: true,
    });
    this.emit(userId, 'create-project', 'thoughts', 'create', { thoughtId: result.id });
    return result;
  }

  @Get('thought/:thoughtId')
  getThought(@Req() req: Request, @Param('thoughtId') thoughtId: string) {
    const userId = this.userIdFromHeaders(req);
    return this.thoughtsService.findOne(userId, thoughtId);
  }

  @Post('list-thoughts')
  async listThoughts(
    @Req() req: Request,
    @Body() body: { parentId?: string; projectId?: string },
  ) {
    const userId = this.userIdFromHeaders(req);

    if (body.parentId && body.projectId) {
      const thoughts = await this.thoughtsService.findAll(userId, body.parentId);
      return thoughts.filter((thought) => thought.projectId === body.projectId);
    }

    if (body.projectId) {
      return this.thoughtsService.findByRoot(userId, body.projectId);
    }

    return this.thoughtsService.findAll(userId, body.parentId);
  }

  @Post('create-thought')
  async createThought(
    @Req() req: Request,
    @Body() body: { body: string; title?: string; parentId?: string },
  ) {
    const userId = this.userIdFromHeaders(req);
    const result = await this.thoughtsService.create(userId, {
      body: body.body,
      title: body.title,
      parentId: body.parentId,
    });
    this.emit(userId, 'create-thought', 'thoughts', 'create', { thoughtId: result.id });
    return result;
  }

  @Post('edit-thought')
  async editThought(
    @Req() req: Request,
    @Body() body: { thoughtId: string; body?: string; title?: string; parentId?: string },
  ) {
    const userId = this.userIdFromHeaders(req);
    const result = await this.thoughtsService.update(userId, body.thoughtId, {
      body: body.body,
      title: body.title,
      parentId: body.parentId,
    });
    this.emit(userId, 'edit-thought', 'thoughts', 'update', { thoughtId: body.thoughtId });
    return result;
  }

  @Post('remove-thought')
  async removeThought(@Req() req: Request, @Body() body: { thoughtId: string }) {
    const userId = this.userIdFromHeaders(req);
    const result = await this.thoughtsService.remove(userId, body.thoughtId);
    this.emit(userId, 'remove-thought', 'thoughts', 'delete', { thoughtId: body.thoughtId });
    return result;
  }

  @Post('remember')
  remember(
    @Req() req: Request,
    @Body() body: { query: string; n?: number },
  ) {
    const userId = this.userIdFromHeaders(req);
    return this.thoughtsService.semanticSearch(userId, body.query, body.n ?? 5);
  }

  @Get('elaborate/:chunkId')
  async elaborate(@Req() req: Request, @Param('chunkId') chunkId: string) {
    const userId = this.userIdFromHeaders(req);

    const rows = await this.db.db
      .select({
        chunkId: chunks.id,
        chunkBody: chunks.body,
        chunkIndex: chunks.chunkIndex,
        thoughtId: chunks.thoughtId,
      })
      .from(chunks)
      .innerJoin(thoughts, eq(chunks.thoughtId, thoughts.id))
      .where(and(eq(chunks.id, chunkId), eq(thoughts.userId, userId)))
      .limit(1);

    const chunk = rows[0];
    if (!chunk) {
      throw new BadRequestException('Chunk not found');
    }

    const thought = await this.thoughtsService.findOne(userId, chunk.thoughtId);
    const parent = thought.parentId
      ? await this.thoughtsService.findOne(userId, thought.parentId)
      : null;

    let siblings: Awaited<ReturnType<ThoughtsService['findAll']>> = [];
    if (thought.parentId) {
      const candidates = await this.thoughtsService.findAll(userId, thought.parentId);
      siblings = candidates.filter((candidate) => candidate.id !== thought.id);
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
    const parent = thought.parentId
      ? await this.thoughtsService.findOne(userId, thought.parentId)
      : null;
    const children = await this.thoughtsService.findAll(userId, thought.id);
    const labels = await this.labelsService.findByThought(thought.id);

    const promptParts: string[] = [];
    promptParts.push('Thought Context');
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

    if (labels.length > 0) {
      promptParts.push('Labels');
      for (const label of labels) {
        promptParts.push(`- ${label.name} (${label.color})${label.isEdge ? ' [edge]' : ''}`);
      }
    }

    return {
      thought,
      parent,
      children,
      labels,
      prompt: promptParts.join('\n'),
    };
  }

  @Post('list-labels')
  listLabels(@Req() req: Request, @Body() body: { projectId?: string }) {
    const userId = this.userIdFromHeaders(req);
    return this.labelsService.findAll(userId, body.projectId);
  }

  @Post('create-label')
  async createLabel(
    @Req() req: Request,
    @Body() body: { name: string; color?: string; projectId?: string },
  ) {
    const userId = this.userIdFromHeaders(req);
    const result = await this.labelsService.create(userId, body.name, body.color, body.projectId);
    this.emit(userId, 'create-label', 'labels', 'create', { labelId: result.id });
    return result;
  }

  @Post('update-label')
  async updateLabel(
    @Req() req: Request,
    @Body() body: { labelId: string; name?: string; color?: string; isEdge?: boolean },
  ) {
    const userId = this.userIdFromHeaders(req);
    const result = await this.labelsService.update(userId, body.labelId, {
      name: body.name,
      color: body.color,
      isEdge: body.isEdge,
    });
    this.emit(userId, 'update-label', 'labels', 'update', { labelId: body.labelId });
    return result;
  }

  @Post('remove-label')
  async removeLabel(@Req() req: Request, @Body() body: { labelId: string }) {
    const userId = this.userIdFromHeaders(req);
    const result = await this.labelsService.remove(userId, body.labelId);
    this.emit(userId, 'remove-label', 'labels', 'delete', { labelId: body.labelId });
    return result;
  }

  @Post('add-label-to-thought')
  async addLabelToThought(
    @Req() req: Request,
    @Body() body: { thoughtId: string; labelId: string },
  ) {
    const userId = this.userIdFromHeaders(req);
    await this.thoughtsService.findOne(userId, body.thoughtId);
    const result = await this.labelsService.assignLabel(userId, body.thoughtId, body.labelId);
    this.emit(userId, 'add-label-to-thought', 'labels', 'update', { thoughtId: body.thoughtId, labelId: body.labelId });
    return result;
  }

  @Post('remove-label-from-thought')
  async removeLabelFromThought(
    @Req() req: Request,
    @Body() body: { thoughtId: string; labelId: string },
  ) {
    const userId = this.userIdFromHeaders(req);
    await this.thoughtsService.findOne(userId, body.thoughtId);
    const result = await this.labelsService.unassignLabel(body.thoughtId, body.labelId);
    this.emit(userId, 'remove-label-from-thought', 'labels', 'update', { thoughtId: body.thoughtId, labelId: body.labelId });
    return result;
  }

  @Get('thought-labels/:thoughtId')
  async getThoughtLabels(@Req() req: Request, @Param('thoughtId') thoughtId: string) {
    const userId = this.userIdFromHeaders(req);
    await this.thoughtsService.findOne(userId, thoughtId);
    return this.labelsService.findByThought(thoughtId);
  }

  @Post('set-label-edge')
  async setLabelEdge(
    @Req() req: Request,
    @Body() body: { labelId: string; isEdge: boolean },
  ) {
    const userId = this.userIdFromHeaders(req);
    const result = await this.labelsService.update(userId, body.labelId, { isEdge: body.isEdge });
    this.emit(userId, 'set-label-edge', 'labels', 'update', { labelId: body.labelId });
    return result;
  }

  @Post('set-thought-color')
  async setThoughtColor(
    @Req() req: Request,
    @Body() body: { thoughtId: string; hex: string },
  ) {
    const userId = this.userIdFromHeaders(req);
    const result = await this.colorsService.setThoughtColor(userId, body.thoughtId, body.hex);
    this.emit(userId, 'set-thought-color', 'colors', 'update', { thoughtId: body.thoughtId });
    return result;
  }

  @Post('clear-thought-color')
  async clearThoughtColor(@Req() req: Request, @Body() body: { thoughtId: string }) {
    const userId = this.userIdFromHeaders(req);
    const result = await this.colorsService.clearThoughtColor(userId, body.thoughtId);
    this.emit(userId, 'clear-thought-color', 'colors', 'delete', { thoughtId: body.thoughtId });
    return result;
  }
}

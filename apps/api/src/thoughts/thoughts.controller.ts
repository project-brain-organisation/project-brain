import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ThoughtsService } from './thoughts.service';

// NOTE (step 04-01): the class-validator DTOs were removed. Validation for the
// active workspace routes now lives in workspace/validation (Zod). These legacy
// `/thoughts` routes are slated for removal/rewiring in step 05-01; until then
// they accept plain request shapes (no body validation on these deprecated routes).
interface CreateThoughtDto {
  body?: string;
  title?: string;
  parentId?: string;
  isRoot?: boolean;
  canvasX?: number;
  canvasY?: number;
}

interface UpdateThoughtDto {
  body?: string;
  title?: string;
  parentId?: string;
  canvasX?: number;
  canvasY?: number;
  width?: number;
  height?: number;
}

@Controller('thoughts')
@UseGuards(JwtAuthGuard)
export class ThoughtsController {
  constructor(private readonly thoughtsService: ThoughtsService) {}

  @Get('roots')
  findRoots(@Req() req: Request) {
    const { userId } = req.user as { userId: string };
    return this.thoughtsService.findRoots(userId);
  }

  @Get('tree')
  findByRoot(@Req() req: Request, @Query('rootId') rootId: string) {
    const { userId } = req.user as { userId: string };
    return this.thoughtsService.findByRoot(userId, rootId);
  }

  @Get()
  findAll(
    @Req() req: Request,
    @Query('parentId') parentId?: string,
  ) {
    const { userId } = req.user as { userId: string };
    return this.thoughtsService.findAll(userId, parentId);
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    const { userId } = req.user as { userId: string };
    return this.thoughtsService.findOne(userId, id);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateThoughtDto) {
    const { userId } = req.user as { userId: string };
    return this.thoughtsService.create(userId, dto);
  }

  @Patch(':id')
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateThoughtDto,
  ) {
    const { userId } = req.user as { userId: string };
    return this.thoughtsService.update(userId, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    const { userId } = req.user as { userId: string };
    return this.thoughtsService.remove(userId, id);
  }
}

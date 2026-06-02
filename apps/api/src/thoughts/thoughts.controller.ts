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
import { CreateThoughtDto } from './dto/create-thought.dto';
import { UpdateThoughtDto } from './dto/update-thought.dto';

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

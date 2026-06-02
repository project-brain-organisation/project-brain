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
import { LabelsService } from './labels.service';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';
import { AssignLabelDto } from './dto/assign-label.dto';

@Controller('labels')
@UseGuards(JwtAuthGuard)
export class LabelsController {
  constructor(private readonly labelsService: LabelsService) {}

  @Get()
  findAll(@Req() req: Request, @Query('projectId') projectId?: string) {
    const { userId } = req.user as { userId: string };
    return this.labelsService.findAll(userId, projectId);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateLabelDto) {
    const { userId } = req.user as { userId: string };
    return this.labelsService.create(userId, dto.name, dto.color, dto.projectId);
  }

  @Patch(':id')
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateLabelDto,
  ) {
    const { userId } = req.user as { userId: string };
    return this.labelsService.update(userId, id, { name: dto.name, color: dto.color, isEdge: dto.isEdge });
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    const { userId } = req.user as { userId: string };
    return this.labelsService.remove(userId, id);
  }

  @Get('edges')
  findEdgeAssignments(@Req() req: Request) {
    const { userId } = req.user as { userId: string };
    return this.labelsService.findEdgeAssignments(userId);
  }

  @Get('thought/:thoughtId')
  findByThought(@Param('thoughtId') thoughtId: string) {
    return this.labelsService.findByThought(thoughtId);
  }

  @Post('thought/:thoughtId')
  assignLabel(
    @Req() req: Request,
    @Param('thoughtId') thoughtId: string,
    @Body() dto: AssignLabelDto,
  ) {
    const { userId } = req.user as { userId: string };
    return this.labelsService.assignLabel(userId, thoughtId, dto.labelId);
  }

  @Delete('thought/:thoughtId/:labelId')
  unassignLabel(
    @Param('thoughtId') thoughtId: string,
    @Param('labelId') labelId: string,
  ) {
    return this.labelsService.unassignLabel(thoughtId, labelId);
  }
}

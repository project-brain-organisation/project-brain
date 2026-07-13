import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { LabelsService } from './labels.service';
import {
  ZodValidationPipe,
  createLabelSchema,
  type CreateLabelRequest,
  updateLabelSchema,
  type UpdateLabelRequest,
} from '../validation';

@Controller('workspace/labels')
@UseGuards(JwtAuthGuard)
export class LabelsController {
  constructor(private readonly labelsService: LabelsService) {}

  @Post()
  create(
    @Req() req: any,
    @Body(new ZodValidationPipe(createLabelSchema)) dto: CreateLabelRequest,
  ) {
    return this.labelsService.create(req.user.userId, dto);
  }

  @Get('project/:projectId')
  findByProject(@Req() req: any, @Param('projectId') projectId: string) {
    return this.labelsService.findByProject(req.user.userId, projectId);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.labelsService.findOne(req.user.userId, id);
  }

  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateLabelSchema)) dto: UpdateLabelRequest,
  ) {
    return this.labelsService.update(req.user.userId, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.labelsService.remove(req.user.userId, id);
  }
}

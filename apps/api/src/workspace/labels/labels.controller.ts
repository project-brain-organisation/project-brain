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
} from '../validation';
import { UpdateLabelDto } from './dto/update-label.dto';

@Controller('workspace/labels')
@UseGuards(JwtAuthGuard)
export class LabelsController {
  constructor(private readonly labelsService: LabelsService) {}

  @Post()
  create(
    @Req() req: any,
    @Body(new ZodValidationPipe(createLabelSchema)) dto: CreateLabelRequest,
  ) {
    return this.labelsService.create(req.user.sub, dto);
  }

  @Get('project/:projectId')
  findByProject(@Req() req: any, @Param('projectId') projectId: string) {
    return this.labelsService.findByProject(req.user.sub, projectId);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.labelsService.findOne(req.user.sub, id);
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateLabelDto) {
    return this.labelsService.update(req.user.sub, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.labelsService.remove(req.user.sub, id);
  }
}

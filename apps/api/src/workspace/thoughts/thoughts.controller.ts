import {
  BadRequestException,
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
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ThoughtsService } from './thoughts.service';
import {
  ZodValidationPipe,
  createThoughtSchema,
  type CreateThoughtRequest,
  updateThoughtSchema,
  type UpdateThoughtRequest,
  setThoughtColorSchema,
  type SetThoughtColorRequest,
} from '../validation';

@Controller('workspace/thoughts')
@UseGuards(JwtAuthGuard)
export class ThoughtsController {
  constructor(private readonly thoughtsService: ThoughtsService) {}

  @Post()
  create(
    @Req() req: any,
    @Body(new ZodValidationPipe(createThoughtSchema)) dto: CreateThoughtRequest,
  ) {
    return this.thoughtsService.create(req.user.userId, dto);
  }

  @Get()
  findByProject(@Req() req: any, @Query('projectId') projectId?: string) {
    if (!projectId) {
      throw new BadRequestException('projectId query parameter is required');
    }
    return this.thoughtsService.findByProject(req.user.userId, projectId);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.thoughtsService.findOne(req.user.userId, id);
  }

  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateThoughtSchema)) dto: UpdateThoughtRequest,
  ) {
    return this.thoughtsService.update(req.user.userId, id, dto);
  }

  @Patch(':id/color')
  setColor(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setThoughtColorSchema)) dto: SetThoughtColorRequest,
  ) {
    return this.thoughtsService.update(req.user.userId, id, { color: dto.color });
  }

  @Delete(':id/color')
  clearColor(@Req() req: any, @Param('id') id: string) {
    return this.thoughtsService.update(req.user.userId, id, { color: null });
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.thoughtsService.remove(req.user.userId, id);
  }
}

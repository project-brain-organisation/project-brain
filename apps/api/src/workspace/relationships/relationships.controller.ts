import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RelationshipsService } from './relationships.service';
import {
  ZodValidationPipe,
  createRelationshipSchema,
  type CreateRelationshipRequest,
} from '../validation';

@Controller('workspace/relationships')
@UseGuards(JwtAuthGuard)
export class RelationshipsController {
  constructor(private readonly relationshipsService: RelationshipsService) {}

  @Post()
  create(
    @Req() req: any,
    @Body(new ZodValidationPipe(createRelationshipSchema)) dto: CreateRelationshipRequest,
  ) {
    return this.relationshipsService.create(req.user.userId, dto);
  }

  @Get()
  findByProject(
    @Req() req: any,
    @Query('projectId') projectId: string,
    @Query('kind') kind?: 'hierarchy' | 'tag' | 'edge',
  ) {
    return this.relationshipsService.findByProject(req.user.userId, projectId, kind);
  }

  @Get('descendants/:thoughtId')
  findDescendants(@Req() req: any, @Param('thoughtId') thoughtId: string) {
    return this.relationshipsService.findDescendants(req.user.userId, thoughtId);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.relationshipsService.findOne(req.user.userId, id);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.relationshipsService.remove(req.user.userId, id);
  }
}

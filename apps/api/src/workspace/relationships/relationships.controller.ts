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
import { CreateRelationshipDto } from './dto/create-relationship.dto';

@Controller('workspace/relationships')
@UseGuards(JwtAuthGuard)
export class RelationshipsController {
  constructor(private readonly relationshipsService: RelationshipsService) {}

  @Post()
  create(@Req() req: any, @Body() dto: CreateRelationshipDto) {
    return this.relationshipsService.create(req.user.sub, dto);
  }

  @Get()
  findByProject(
    @Req() req: any,
    @Query('projectId') projectId: string,
    @Query('kind') kind?: 'hierarchy' | 'tag' | 'edge',
  ) {
    return this.relationshipsService.findByProject(req.user.sub, projectId, kind);
  }

  @Get('descendants/:thoughtId')
  findDescendants(@Req() req: any, @Param('thoughtId') thoughtId: string) {
    return this.relationshipsService.findDescendants(req.user.sub, thoughtId);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.relationshipsService.findOne(req.user.sub, id);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.relationshipsService.remove(req.user.sub, id);
  }
}

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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import {
  ZodValidationPipe,
  createProjectSchema,
  type CreateProjectRequest,
} from '../workspace/validation';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  findAll(@Req() req: any) {
    return this.projectsService.findAllByUser(req.user.userId);
  }

  // Must precede @Get(':id') so 'public' isn't captured as an id.
  @Get('public')
  findPublic(@Req() req: any) {
    return this.projectsService.findPublic(req.user.userId);
  }

  @Post(':id/clone')
  clone(@Req() req: any, @Param('id') id: string) {
    return this.projectsService.clone(req.user.userId, id);
  }

  @Post(':id/subscription')
  subscribe(@Req() req: any, @Param('id') id: string) {
    return this.projectsService.subscribe(req.user.userId, id);
  }

  @Delete(':id/subscription')
  unsubscribe(@Req() req: any, @Param('id') id: string) {
    return this.projectsService.unsubscribe(req.user.userId, id);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.projectsService.findOne(req.user.userId, id);
  }

  @Post()
  create(
    @Req() req: any,
    @Body(new ZodValidationPipe(createProjectSchema)) dto: CreateProjectRequest,
  ) {
    return this.projectsService.create(req.user.userId, dto);
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: Partial<CreateProjectDto>) {
    return this.projectsService.update(req.user.userId, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.projectsService.remove(req.user.userId, id);
  }
}

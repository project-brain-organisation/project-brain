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

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  findAll(@Req() req: any) {
    return this.projectsService.findAllByUser(req.user.sub);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.projectsService.findOne(req.user.sub, id);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(req.user.sub, dto);
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: Partial<CreateProjectDto>) {
    return this.projectsService.update(req.user.sub, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.projectsService.remove(req.user.sub, id);
  }
}

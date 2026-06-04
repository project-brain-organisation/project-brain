import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ProjectsModule } from '../projects/projects.module';
import { ThoughtsService } from './thoughts/thoughts.service';
import { ThoughtsController } from './thoughts/thoughts.controller';
import { LabelsService } from './labels/labels.service';
import { LabelsController } from './labels/labels.controller';

@Module({
  imports: [DatabaseModule, ProjectsModule],
  providers: [ThoughtsService, LabelsService],
  controllers: [ThoughtsController, LabelsController],
  exports: [ThoughtsService, LabelsService],
})
export class WorkspaceModule {}

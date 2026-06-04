import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ProjectsModule } from '../projects/projects.module';
import { ThoughtsService } from './thoughts/thoughts.service';
import { ThoughtsController } from './thoughts/thoughts.controller';
import { LabelsService } from './labels/labels.service';
import { LabelsController } from './labels/labels.controller';
import { RelationshipsService } from './relationships/relationships.service';
import { RelationshipsController } from './relationships/relationships.controller';

@Module({
  imports: [DatabaseModule, ProjectsModule],
  providers: [ThoughtsService, LabelsService, RelationshipsService],
  controllers: [ThoughtsController, LabelsController, RelationshipsController],
  exports: [ThoughtsService, LabelsService, RelationshipsService],
})
export class WorkspaceModule {}

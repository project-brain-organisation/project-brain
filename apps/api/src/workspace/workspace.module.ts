import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  // TODO: add ProjectsModule when ProjectsModule is available
  // TODO: providers: [ThoughtsService, LabelsService, RelationshipsService, PipelineService]
  // TODO: exports: [ThoughtsService, LabelsService, RelationshipsService]
})
export class WorkspaceModule {}

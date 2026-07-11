import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ProjectsModule } from '../projects/projects.module';
import { WorkspaceEventsModule } from './gateway/workspace-events.module';
import { WorkspaceGatewayController } from './gateway/workspace.gateway.controller';
import { ThoughtsService } from './thoughts/thoughts.service';
import { ThoughtsController } from './thoughts/thoughts.controller';
import { LabelsService } from './labels/labels.service';
import { LabelsController } from './labels/labels.controller';
import { RelationshipsService } from './relationships/relationships.service';
import { RelationshipsController } from './relationships/relationships.controller';
import { PipelineService } from './pipeline/pipeline.service';
import { ChunkingService } from './pipeline/chunking.service';
import { EmbeddingService } from './pipeline/embedding.service';

@Module({
  imports: [DatabaseModule, ProjectsModule, WorkspaceEventsModule],
  providers: [
    ThoughtsService,
    LabelsService,
    RelationshipsService,
    PipelineService,
    ChunkingService,
    EmbeddingService,
  ],
  controllers: [WorkspaceGatewayController, ThoughtsController, LabelsController, RelationshipsController],
  exports: [WorkspaceEventsModule, ThoughtsService, LabelsService, RelationshipsService, PipelineService],
})
export class WorkspaceModule {}

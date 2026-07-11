import { Module } from '@nestjs/common';
import { WorkspaceEventsModule } from '../workspace/gateway/workspace-events.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [WorkspaceEventsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}

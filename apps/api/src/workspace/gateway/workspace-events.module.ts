import { Module } from '@nestjs/common';
import { WorkspaceEventsService } from './workspace-events.service';

/**
 * Standalone module so publishers outside WorkspaceModule (e.g. ProjectsModule)
 * can inject the same WorkspaceEventsService singleton without a circular
 * ProjectsModule <-> WorkspaceModule import.
 */
@Module({
  providers: [WorkspaceEventsService],
  exports: [WorkspaceEventsService],
})
export class WorkspaceEventsModule {}

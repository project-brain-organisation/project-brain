import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { WorkspaceModule } from '../workspace/workspace.module';
import { InternalMcpController } from './internal-mcp.controller';
import { McpInternalGuard } from './mcp-internal.guard';

@Module({
  imports: [WorkspaceModule, ProjectsModule],
  controllers: [InternalMcpController],
  providers: [McpInternalGuard],
})
export class InternalMcpModule {}

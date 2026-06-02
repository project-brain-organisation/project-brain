import { Module } from '@nestjs/common';
import { ColorsModule } from '../colors/colors.module';
import { LabelsModule } from '../labels/labels.module';
import { McpEventsModule } from '../mcp-events/mcp-events.module';
import { ThoughtsModule } from '../thoughts/thoughts.module';
import { InternalMcpController } from './internal-mcp.controller';
import { McpInternalGuard } from './mcp-internal.guard';

@Module({
  imports: [ThoughtsModule, LabelsModule, ColorsModule, McpEventsModule],
  controllers: [InternalMcpController],
  providers: [McpInternalGuard],
})
export class InternalMcpModule {}

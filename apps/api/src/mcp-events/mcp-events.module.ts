import { Module } from '@nestjs/common';
import { McpEventsController } from './mcp-events.controller';
import { McpEventsService } from './mcp-events.service';

@Module({
  controllers: [McpEventsController],
  providers: [McpEventsService],
  exports: [McpEventsService],
})
export class McpEventsModule {}

import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ThoughtsModule } from './thoughts/thoughts.module';
import { ChunkingModule } from './chunking/chunking.module';
import { EmbeddingModule } from './embedding/embedding.module';
import { LabelsModule } from './labels/labels.module';
import { ColorsModule } from './colors/colors.module';
import { InternalMcpModule } from './internal-mcp/internal-mcp.module';
import { McpEventsModule } from './mcp-events/mcp-events.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    UsersModule,
    ThoughtsModule,
    ChunkingModule,
    EmbeddingModule,
    LabelsModule,
    ColorsModule,
    InternalMcpModule,
    McpEventsModule,
  ],
})
export class AppModule {}

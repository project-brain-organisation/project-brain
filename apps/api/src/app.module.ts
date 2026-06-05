import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProjectsModule } from './projects/projects.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { InternalMcpModule } from './internal-mcp/internal-mcp.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    WorkspaceModule,
    InternalMcpModule,
  ],
})
export class AppModule {}

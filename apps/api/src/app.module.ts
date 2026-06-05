import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProjectsModule } from './projects/projects.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { InternalMcpModule } from './internal-mcp/internal-mcp.module';
import { TenantContextInterceptor } from './auth/interceptors/tenant-context.interceptor';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    WorkspaceModule,
    InternalMcpModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantContextInterceptor,
    },
  ],
})
export class AppModule {}

import { Controller, Req, Res, Sse, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceEventsService } from './workspace-events.service';

@Controller('workspace/events')
@UseGuards(JwtAuthGuard)
export class WorkspaceGatewayController {
  constructor(private readonly workspaceEvents: WorkspaceEventsService) {}

  @Sse()
  stream(@Req() req: Request, @Res() res: Response) {
    const { userId } = req.user as { userId: string };

    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Cache-Control', 'no-cache');

    return this.workspaceEvents.streamForUser(userId);
  }
}

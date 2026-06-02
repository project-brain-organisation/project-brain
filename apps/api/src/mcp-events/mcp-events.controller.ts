import { Controller, Req, Res, Sse, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { McpEventsService } from './mcp-events.service';

@Controller('mcp/events')
@UseGuards(JwtAuthGuard)
export class McpEventsController {
  constructor(private readonly mcpEventsService: McpEventsService) {}

  @Sse()
  stream(@Req() req: Request, @Res() res: Response) {
    const { userId } = req.user as { userId: string };

    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Cache-Control', 'no-cache');

    return this.mcpEventsService.streamForUser(userId);
  }
}

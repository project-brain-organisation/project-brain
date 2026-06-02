import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';

function isTimingSafeMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

@Injectable()
export class McpInternalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const provided = req.header('x-mcp-internal-key') ?? '';
    const expected = process.env.MCP_INTERNAL_KEY;

    if (!expected || !isTimingSafeMatch(provided, expected)) {
      throw new UnauthorizedException('Invalid internal MCP key');
    }

    const userId = req.header('x-mcp-user-id');
    if (!userId) {
      throw new UnauthorizedException('Missing x-mcp-user-id header');
    }

    return true;
  }
}

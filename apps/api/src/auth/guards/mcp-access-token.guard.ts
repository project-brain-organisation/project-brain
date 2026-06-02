import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class McpAccessTokenGuard extends AuthGuard('mcp-access-token') {}

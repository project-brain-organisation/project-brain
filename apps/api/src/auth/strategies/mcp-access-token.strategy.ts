import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class McpAccessTokenStrategy extends PassportStrategy(
  Strategy,
  'mcp-access-token',
) {
  constructor() {
    const secret = process.env.MCP_ACCESS_TOKEN_SECRET ?? process.env.JWT_SECRET;

    if (!secret) {
      throw new Error('Missing MCP_ACCESS_TOKEN_SECRET or JWT_SECRET');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      issuer: process.env.MCP_TOKEN_ISSUER ?? 'project-brain-api',
      audience: process.env.MCP_TOKEN_AUDIENCE ?? 'mcp-sidecar',
    });
  }

  validate(payload: { sub: string; scope?: string }) {
    return {
      userId: payload.sub,
      scope: payload.scope ?? 'mcp:tools',
    };
  }
}

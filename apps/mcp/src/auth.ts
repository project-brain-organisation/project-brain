import type { Request } from 'express';
import { jwtVerify, type JWTPayload } from 'jose';

export function getMcpServerKey(req: Request): string | null {
  const fromHeader = req.header('x-mcp-key');
  if (fromHeader) {
    return fromHeader;
  }

  if (process.env.NODE_ENV !== 'production') {
    const fromQuery = req.query.mcp_key;
    if (typeof fromQuery === 'string') {
      return fromQuery;
    }
  }

  return null;
}

export function parseBearerTokenHeader(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const [scheme, ...rest] = authHeader.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || rest.length === 0) {
    return null;
  }

  const token = rest.join(' ').trim();
  return token.length > 0 ? token : null;
}

export function getMcpAccessToken(req: Request): string | null {
  const auth = req.header('authorization');
  const token = parseBearerTokenHeader(auth);
  if (token) {
    return token;
  }

  return null;
}

export interface McpAccessClaims extends JWTPayload {
  sub: string;
  scope?: string;
}

export async function verifyMcpAccessToken(token: string): Promise<McpAccessClaims | null> {
  const secret = process.env.MCP_ACCESS_TOKEN_SECRET ?? process.env.JWT_SECRET;
  if (!secret) {
    return null;
  }

  const issuer = process.env.MCP_TOKEN_ISSUER ?? 'project-brain-api';
  const audience = process.env.MCP_TOKEN_AUDIENCE ?? 'mcp-sidecar';
  const verified = await jwtVerify(token, new TextEncoder().encode(secret), {
    issuer,
    audience,
  }).catch(() => null);

  if (!verified) {
    return null;
  }

  const { payload } = verified;

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    return null;
  }

  return payload as McpAccessClaims;
}

export function authErrorMessage(req: Request): string {
  const auth = req.header('authorization');
  if (!auth) {
    return 'Missing Authorization header';
  }

  if (!parseBearerTokenHeader(auth)) {
    return 'Malformed bearer token header';
  }

  return 'Invalid bearer token';
}

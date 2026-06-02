import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { json, urlencoded, type Request, type Response } from 'express';
import { randomBytes } from 'node:crypto';

function baseUrl(req: Request): string {
  const forwardedProto = req.header('x-forwarded-proto');
  const protocol = forwardedProto?.split(',')[0]?.trim() || req.protocol;
  return `${protocol}://${req.get('host')}`;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Trust Railway's reverse proxy for X-Forwarded-Proto
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  expressApp.get('/.well-known/oauth-authorization-server', (req: Request, res: Response) => {
    const base = baseUrl(req);
    res.json({
      issuer: base,
      authorization_endpoint: `${base}/api/auth/mcp/authorize`,
      token_endpoint: `${base}/api/auth/mcp/token`,
      registration_endpoint: `${base}/api/auth/mcp/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['mcp:tools'],
    });
  });

  expressApp.get('/.well-known/oauth-protected-resource/mcp', (req: Request, res: Response) => {
    const base = baseUrl(req);
    const resource = process.env.MCP_PUBLIC_RESOURCE_URL ?? `${base}/mcp`;
    res.json({
      resource,
      authorization_servers: [base],
      bearer_methods_supported: ['header'],
      scopes_supported: ['mcp:tools'],
    });
  });

  expressApp.post('/api/auth/mcp/register', json({ limit: '1mb' }), (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      redirect_uris?: unknown;
      client_name?: unknown;
      token_endpoint_auth_method?: unknown;
      grant_types?: unknown;
      response_types?: unknown;
      scope?: unknown;
    };
    const redirectUris = Array.isArray(body.redirect_uris)
      ? (body.redirect_uris as unknown[]).filter((u): u is string => typeof u === 'string')
      : [];
    if (redirectUris.length === 0) {
      res.status(400).json({ error: 'invalid_redirect_uri', error_description: 'redirect_uris is required' });
      return;
    }
    const clientId = `mcp-${randomBytes(16).toString('hex')}`;
    res.status(201).json({
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_name: typeof body.client_name === 'string' ? body.client_name : 'MCP Client',
      scope: typeof body.scope === 'string' ? body.scope : 'mcp:tools',
    });
  });

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true }));

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: [
      process.env.FRONTEND_URL || 'http://localhost:5173',
      'https://claude.ai',
      'https://www.claude.ai',
    ],
    credentials: true,
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`API running on http://localhost:${port}`);
}
bootstrap();

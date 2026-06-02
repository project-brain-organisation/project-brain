import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private baseUrl(req: Request): string {
    const forwardedProto = req.header('x-forwarded-proto');
    const protocol = forwardedProto?.split(',')[0]?.trim() || req.protocol;
    return `${protocol}://${req.get('host')}`;
  }

  getMcpAuthorizationServerMetadata(req: Request) {
    const base = this.baseUrl(req);
    return {
      issuer: `${base}/api/auth/mcp`,
      authorization_endpoint: `${base}/api/auth/mcp/authorize`,
      token_endpoint: `${base}/api/auth/mcp/token`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['mcp:tools'],
    };
  }

  getMcpProtectedResourceMetadata(req: Request) {
    const base = this.baseUrl(req);
    return {
      resource: `${base}/mcp`,
      authorization_servers: [this.getMcpAuthorizationServerMetadata(req).issuer],
      bearer_methods_supported: ['header'],
      scopes_supported: ['mcp:tools'],
    };
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin() {
    // Guard redirects to Google
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  googleCallback(@Req() req: Request, @Res() res: Response) {
    const user = req.user as { id: string };
    const token = this.authService.signToken(user.id);

    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('pb_token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    const returnTo = req.cookies?.pb_return_to as string | undefined;
    if (returnTo && returnTo.startsWith('/')) {
      res.clearCookie('pb_return_to');
      res.redirect(returnTo);
      return;
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(frontendUrl);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: Request) {
    const { userId } = req.user as { userId: string };
    const user = await this.authService.findUserById(userId);
    if (!user) return null;
    return { id: user.id, username: user.username };
  }

  @Post('logout')
  logout(@Res() res: Response) {
    res.clearCookie('pb_token');
    res.json({ ok: true });
  }

  @Get('mcp/authorize')
  async mcpAuthorize(
    @Req() req: Request,
    @Res() res: Response,
    @Query('response_type') responseType: string,
    @Query('client_id') clientId: string,
    @Query('redirect_uri') redirectUri: string,
    @Query('state') state: string | undefined,
    @Query('scope') scope: string | undefined,
    @Query('code_challenge') codeChallenge: string,
    @Query('code_challenge_method') codeChallengeMethod: string | undefined,
  ) {
    const userId = await this.authService.userIdFromRequest(req);
    if (!userId) {
      const isProd = process.env.NODE_ENV === 'production';
      res.cookie('pb_return_to', req.originalUrl, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
        maxAge: 10 * 60 * 1000,
      });
      res.redirect('/api/auth/google');
      return;
    }

    if (responseType !== 'code') {
      throw new BadRequestException('Unsupported response_type');
    }

    if (!clientId || !redirectUri || !codeChallenge) {
      throw new BadRequestException('Missing required OAuth parameters');
    }

    if ((codeChallengeMethod ?? 'S256') !== 'S256') {
      throw new BadRequestException('Only S256 code challenge is supported');
    }

    const codeRecord = await this.authService.createMcpAuthorizationCode({
      userId,
      clientId,
      redirectUri,
      codeChallenge,
      codeChallengeMethod: 'S256',
    });

    const redirect = new URL(redirectUri);
    redirect.searchParams.set('code', codeRecord.code);
    if (state) {
      redirect.searchParams.set('state', state);
    }
    if (scope) {
      redirect.searchParams.set('scope', scope);
    }

    res.redirect(redirect.toString());
  }

  @Post('mcp/token')
  async mcpToken(@Req() req: Request, @Res() res: Response) {
    const body = req.body as Record<string, unknown>;
    const grantType = String(body.grant_type ?? '');

    if (grantType === 'authorization_code') {
      const code = String(body.code ?? '');
      const clientId = String(body.client_id ?? '');
      const redirectUri = String(body.redirect_uri ?? '');
      const codeVerifier = String(body.code_verifier ?? '');
      const scope = body.scope ? String(body.scope) : 'mcp:tools';

      if (!code || !clientId || !redirectUri || !codeVerifier) {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing required authorization_code parameters',
        });
        return;
      }

      const tokenSet = await this.authService.exchangeAuthorizationCode({
        code,
        clientId,
        redirectUri,
        codeVerifier,
        scope,
      });

      if (!tokenSet) {
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }

      res.json({
        access_token: tokenSet.accessToken,
        token_type: tokenSet.tokenType,
        expires_in: tokenSet.expiresIn,
        scope: tokenSet.scope,
        refresh_token: tokenSet.refreshToken,
      });
      return;
    }

    if (grantType === 'refresh_token') {
      const refreshToken = String(body.refresh_token ?? '');
      const clientId = body.client_id ? String(body.client_id) : undefined;
      const scope = body.scope ? String(body.scope) : 'mcp:tools';

      if (!refreshToken) {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing refresh_token',
        });
        return;
      }

      const tokenSet = await this.authService.rotateRefreshToken({
        refreshToken,
        clientId,
        scope,
      });

      if (!tokenSet) {
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }

      res.json({
        access_token: tokenSet.accessToken,
        token_type: tokenSet.tokenType,
        expires_in: tokenSet.expiresIn,
        scope: tokenSet.scope,
        refresh_token: tokenSet.refreshToken,
      });
      return;
    }

    res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: 'Supported grant types: authorization_code, refresh_token',
    });
  }
}

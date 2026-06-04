import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  credentials,
  mcpAuthCodes,
  mcpRefreshTokens,
} from '../database/schema';
import { eq, and } from 'drizzle-orm';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { UsersService } from '../users/users.service';

interface GoogleProfile {
  id: string;
  displayName: string;
  emails: { value: string }[];
}

interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async validateGoogleUser(profile: GoogleProfile, tokens: GoogleTokens) {
    const [existing] = await this.db.db
      .select()
      .from(credentials)
      .where(
        and(
          eq(credentials.provider, 'google'),
          eq(credentials.providerId, profile.id),
        ),
      )
      .limit(1);

    if (existing) {
      await this.db.db
        .update(credentials)
        .set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken ?? existing.refreshToken,
          tokenExpiresAt: tokens.expiresIn
            ? new Date(Date.now() + tokens.expiresIn * 1000)
            : existing.tokenExpiresAt,
        })
        .where(eq(credentials.id, existing.id));

      return this.usersService.findById(existing.userId);
    }

    const username =
      profile.displayName || profile.emails?.[0]?.value || 'User';

    const user = await this.usersService.create({ username });

    await this.db.db.insert(credentials).values({
      userId: user.id,
      provider: 'google',
      providerId: profile.id,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? null,
      tokenExpiresAt: tokens.expiresIn
        ? new Date(Date.now() + tokens.expiresIn * 1000)
        : null,
    });

    return user;
  }

  signToken(userId: string): string {
    return this.jwt.sign({ sub: userId });
  }

  async userIdFromRequest(req: { cookies?: Record<string, string> }): Promise<string | null> {
    const token = req.cookies?.pb_token;
    if (!token) return null;
    const payload = await this.jwt
      .verifyAsync<{ sub?: string }>(token)
      .then((p) => p)
      .catch(() => null);
    return payload?.sub ?? null;
  }

  async findUserById(userId: string) {
    return this.usersService.findById(userId);
  }

  private mcpAccessTokenSecret(): string {
    const secret = process.env.MCP_ACCESS_TOKEN_SECRET ?? process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('Missing MCP_ACCESS_TOKEN_SECRET or JWT_SECRET');
    }
    return secret;
  }

  private mcpTokenIssuer(): string {
    return process.env.MCP_TOKEN_ISSUER ?? 'project-brain-api';
  }

  private mcpTokenAudience(): string {
    return process.env.MCP_TOKEN_AUDIENCE ?? 'mcp-sidecar';
  }

  private mcpAccessTokenTtlSeconds(): number {
    return Number(process.env.MCP_ACCESS_TOKEN_TTL_SECONDS ?? 900);
  }

  private mcpRefreshTokenTtlSeconds(): number {
    return Number(process.env.MCP_REFRESH_TOKEN_TTL_SECONDS ?? 2592000);
  }

  private createOpaqueToken(): string {
    return randomBytes(32).toString('hex');
  }

  private validatePkceS256(codeVerifier: string, codeChallenge: string): boolean {
    const hash = createHash('sha256').update(codeVerifier).digest('base64url');
    return hash === codeChallenge;
  }

  private signMcpAccessToken(userId: string, scope: string): string {
    return this.jwt.sign(
      {
        sub: userId,
        scope,
      },
      {
        secret: this.mcpAccessTokenSecret(),
        issuer: this.mcpTokenIssuer(),
        audience: this.mcpTokenAudience(),
        expiresIn: this.mcpAccessTokenTtlSeconds(),
      },
    );
  }

  async createMcpAuthorizationCode(input: {
    userId: string;
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    codeChallengeMethod: 'S256';
  }) {
    const code = this.createOpaqueToken();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.db.db.insert(mcpAuthCodes).values({
      code,
      userId: input.userId,
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      codeChallengeMethod: input.codeChallengeMethod,
      expiresAt,
      used: false,
    });

    return { code, expiresAt };
  }

  private async issueRefreshToken(userId: string, clientId: string, rotatedFrom?: string) {
    const token = this.createOpaqueToken();
    const expiresAt = new Date(Date.now() + this.mcpRefreshTokenTtlSeconds() * 1000);

    await this.db.db.insert(mcpRefreshTokens).values({
      token,
      userId,
      clientId,
      expiresAt,
      revoked: false,
      rotatedFrom: rotatedFrom ?? null,
    });

    return { token, expiresAt };
  }

  async exchangeAuthorizationCode(input: {
    code: string;
    clientId: string;
    redirectUri: string;
    codeVerifier: string;
    scope?: string;
  }) {
    const [stored] = await this.db.db
      .select()
      .from(mcpAuthCodes)
      .where(eq(mcpAuthCodes.code, input.code))
      .limit(1);

    if (!stored) {
      return null;
    }

    if (
      stored.clientId !== input.clientId ||
      stored.redirectUri !== input.redirectUri ||
      stored.used ||
      stored.expiresAt.getTime() <= Date.now() ||
      !stored.codeChallenge ||
      stored.codeChallengeMethod !== 'S256' ||
      !this.validatePkceS256(input.codeVerifier, stored.codeChallenge)
    ) {
      return null;
    }

    await this.db.db
      .update(mcpAuthCodes)
      .set({ used: true, consumedAt: new Date() })
      .where(eq(mcpAuthCodes.code, stored.code));

    const scope = input.scope ?? 'mcp:tools';
    const accessToken = this.signMcpAccessToken(stored.userId, scope);
    const refreshToken = await this.issueRefreshToken(stored.userId, stored.clientId);

    return {
      accessToken,
      tokenType: 'Bearer' as const,
      expiresIn: this.mcpAccessTokenTtlSeconds(),
      scope,
      refreshToken: refreshToken.token,
      refreshTokenExpiresAt: refreshToken.expiresAt,
    };
  }

  async rotateRefreshToken(input: {
    refreshToken: string;
    clientId?: string;
    scope?: string;
  }) {
    const [stored] = await this.db.db
      .select()
      .from(mcpRefreshTokens)
      .where(eq(mcpRefreshTokens.token, input.refreshToken))
      .limit(1);

    if (!stored) {
      return null;
    }

    if (
      stored.revoked ||
      stored.expiresAt.getTime() <= Date.now() ||
      (input.clientId !== undefined && input.clientId !== stored.clientId)
    ) {
      return null;
    }

    await this.db.db
      .update(mcpRefreshTokens)
      .set({ revoked: true })
      .where(eq(mcpRefreshTokens.token, stored.token));

    const scope = input.scope ?? 'mcp:tools';
    const accessToken = this.signMcpAccessToken(stored.userId, scope);
    const nextRefreshToken = await this.issueRefreshToken(
      stored.userId,
      stored.clientId,
      stored.token,
    );

    return {
      accessToken,
      tokenType: 'Bearer' as const,
      expiresIn: this.mcpAccessTokenTtlSeconds(),
      scope,
      refreshToken: nextRefreshToken.token,
      refreshTokenExpiresAt: nextRefreshToken.expiresAt,
    };
  }

}

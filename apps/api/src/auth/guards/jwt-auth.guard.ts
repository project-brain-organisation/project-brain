import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * JWT auth guard.
 *
 * Delegates to Passport's JWT strategy (JwtStrategy) which validates the
 * bearer token and attaches `{ userId: string }` to `req.user` on success.
 *
 * ALS tenant context is established by TenantContextInterceptor, which runs
 * after the guard and wraps next.handle() so the store is active for the
 * handler's full async execution tree. The guard no longer attempts to set
 * the ALS store — doing so was broken because req.user is undefined at the
 * point canActivate() reads it (Passport validates async, after the guard
 * returns), and tenantStorage.run() around a boolean result does not propagate
 * to the handler invocation.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

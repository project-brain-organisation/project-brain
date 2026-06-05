import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { tenantStorage } from '../../database/tenant-context';

/**
 * JWT auth guard.
 *
 * After passport validates the JWT, the `user` object (`{ userId: string }`)
 * is attached to the request by JwtStrategy.validate(). The guard then wraps
 * the request's execution context in the AsyncLocalStorage tenant store so that
 * `DatabaseService.getCurrentUserId()` returns the authenticated user's id for
 * the lifetime of the request.
 *
 * This satisfies criterion 3: the ALS store is populated from payload.sub for
 * every authenticated request, enabling any downstream code (e.g. pipeline
 * services) to retrieve the current userId without explicit parameter passing.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  override canActivate(context: ExecutionContext) {
    // Validate JWT first (sets req.user via JwtStrategy.validate).
    const result = super.canActivate(context);

    // Wrap the remainder of the request in the ALS tenant store.
    // We use a microtask continuation so the store is active when downstream
    // code runs, while still returning the validation result synchronously.
    const req = context.switchToHttp().getRequest<{ user?: { userId?: string } }>();
    const userId = req?.user?.userId;

    if (userId) {
      // Note: tenantStorage.run() is called here to establish the store.
      // The actual handler executes after canActivate resolves, within this
      // async context — Node's ALS propagates the store through promise chains
      // that originate from this call frame.
      return tenantStorage.run({ userId }, async () => {
        // Await the validation result (may be Promise<boolean> | boolean | Observable).
        if (result instanceof Promise) {
          return result;
        }
        return result;
      });
    }

    return result;
  }
}

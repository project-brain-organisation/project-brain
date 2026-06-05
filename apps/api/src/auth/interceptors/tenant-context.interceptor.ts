import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tenantStorage } from '../../database/tenant-context';

/**
 * TenantContextInterceptor — establishes the AsyncLocalStorage tenant store
 * for every authenticated request.
 *
 * The JWT guard runs `super.canActivate()` which attaches `req.user` via
 * JwtStrategy.validate(). By the time this interceptor runs, `req.user` is
 * already populated. Wrapping `next.handle()` inside `tenantStorage.run()`
 * means the ALS context is active for the full async execution tree of the
 * request handler, including any awaited service calls.
 *
 * This replaces the broken guard-based ALS wiring where `req.user` was read
 * synchronously before Passport's async validation resolved.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ user?: { userId?: string } }>();
    const userId = req?.user?.userId;

    if (!userId) return next.handle();

    // Wrap next.handle() inside tenantStorage.run() so the ALS store is active
    // for the handler's entire async execution tree.
    return new Observable((subscriber) => {
      tenantStorage.run({ userId }, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}

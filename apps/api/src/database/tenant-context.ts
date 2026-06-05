/**
 * Shared AsyncLocalStorage store for tenant context propagation.
 *
 * This module is the single source of truth for the per-request tenant store.
 * Both DatabaseService (which reads/writes the store) and the JWT guard
 * (which populates it per request) import from here to avoid circular deps.
 */
import { AsyncLocalStorage } from 'async_hooks';

export interface TenantStore {
  userId?: string;
}

export const tenantStorage = new AsyncLocalStorage<TenantStore>();

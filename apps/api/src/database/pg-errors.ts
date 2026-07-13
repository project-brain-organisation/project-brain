/**
 * True when err — or anything on its cause chain — is a Postgres unique
 * violation. Drizzle wraps driver errors (DrizzleQueryError), so the pg
 * error code sits on `.cause`, possibly nested.
 */
export function isUniqueViolation(err: unknown): boolean {
  for (
    let e = err as { code?: unknown; cause?: unknown } | undefined;
    e;
    e = e.cause as typeof e
  ) {
    if (e.code === '23505') return true;
  }
  return false;
}

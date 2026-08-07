/**
 * HTTP errors, shaped to match NestJS exactly.
 *
 * The migration's central bet (see docs/SUPABASE_ONLY_MIGRATION_AUDIT.md
 * §6) is that the 17 client modules in services/*.ts are the seam: all 99
 * method signatures stay byte-identical and only their bodies change. That
 * holds ONLY if the wire format is identical too -- so these mirror
 * backend/src/common/filters/http-exception.filter.ts, including the
 * `error` field being omitted rather than null when absent.
 *
 * Deno has no @nestjs/common, so the small subset the app actually throws
 * is reproduced here rather than pulling in a framework.
 */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Nest's `error` field -- the status name, e.g. "Bad Request". */
    readonly error?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const BadRequest = (m = 'Bad Request') =>
  new HttpError(400, m, 'Bad Request');
export const Unauthorized = (m = 'Unauthorized') =>
  new HttpError(401, m, 'Unauthorized');
export const Forbidden = (m = 'Forbidden') =>
  new HttpError(403, m, 'Forbidden');
export const NotFound = (m = 'Not Found') =>
  new HttpError(404, m, 'Not Found');
export const Conflict = (m = 'Conflict') => new HttpError(409, m, 'Conflict');
export const TooManyRequests = (m = 'Too Many Requests') =>
  new HttpError(429, m, 'Too Many Requests');

/**
 * Nest's filter catches EVERYTHING and reports non-HttpException as a bare
 * 500 "Internal server error" with no detail. Match that: an unexpected
 * throw must not leak a stack trace or a Postgres error string to a client.
 * The real error still reaches the function logs via the caller.
 */
export function toErrorBody(err: unknown): {
  body: Record<string, unknown>;
  status: number;
} {
  const isHttp = err instanceof HttpError;
  const status = isHttp ? err.status : 500;
  const message = isHttp ? err.message : 'Internal server error';
  const error = isHttp ? err.error : undefined;

  const body: Record<string, unknown> = {
    statusCode: status,
    message,
    timestamp: new Date().toISOString(),
  };
  // Nest emits `error: undefined`, which JSON.stringify drops entirely.
  // Only set the key when there is a value, so the payload matches byte
  // for byte rather than carrying an explicit null.
  if (error !== undefined) body.error = error;

  return { body, status };
}

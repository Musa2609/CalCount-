/**
 * Error type shared by every module in this function.
 *
 * `status`/`code` are safe to return to the client; anything unexpected is
 * turned into a generic 500 by `toClientError` so stack traces, upstream URLs
 * and credentials never reach the app.
 */
export type ErrorCode =
  | 'invalid_request'
  | 'unauthorized'
  | 'payload_too_large'
  | 'unsupported_image'
  | 'invalid_image'
  | 'rate_limited'
  | 'vision_not_configured'
  | 'vision_auth_failed'
  | 'vision_busy'
  | 'vision_quota_exhausted'
  | 'vision_model_missing'
  | 'vision_timeout'
  | 'vision_invalid_response'
  | 'vision_failed'
  | 'busy'
  | 'internal_error';

export class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly retryAfterSeconds: number | null;
  /**
   * Log-only diagnostic such as `429/insufficient_quota`. It never reaches the
   * client and never contains a key or a request payload.
   */
  readonly upstream: string | null;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    retryAfterSeconds: number | null = null,
    upstream: string | null = null,
  ) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
    this.upstream = upstream;
  }
}

export function isHttpError(value: unknown): value is HttpError {
  return value instanceof HttpError;
}

export interface ClientError {
  status: number;
  code: ErrorCode;
  message: string;
  retryAfterSeconds: number | null;
  upstream: string | null;
}

export function toClientError(error: unknown): ClientError {
  if (isHttpError(error)) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      retryAfterSeconds: error.retryAfterSeconds,
      upstream: error.upstream,
    };
  }
  return {
    status: 500,
    code: 'internal_error',
    message: 'Photo analysis failed. Please try again.',
    retryAfterSeconds: null,
    upstream: null,
  };
}

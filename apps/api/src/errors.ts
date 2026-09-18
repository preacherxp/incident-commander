import type { ApiErrorCode } from "@incident-commander/contracts";

const retryable: Record<ApiErrorCode, boolean> = {
  INVALID_REQUEST: false,
  GUEST_SESSION_REQUIRED: false,
  ORIGIN_REJECTED: false,
  RUN_NOT_FOUND: false,
  REVISION_CONFLICT: true,
  RUN_FINALIZED: false,
  IDEMPOTENCY_KEY_REUSED: false,
  INPUT_ALREADY_RECORDED: false,
  VERSION_UNAVAILABLE: false,
  RUN_INPUT_LIMIT: false,
  PAYLOAD_TOO_LARGE: false,
  RATE_LIMITED: true,
  SERVICE_UNAVAILABLE: true,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;
  readonly isRetryable: boolean;

  constructor(
    code: ApiErrorCode,
    status: number,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
    this.isRetryable = retryable[code];
  }
}

export function errorBody(error: ApiError, requestId: string) {
  return {
    error: {
      code: error.code,
      message: error.message,
      retryable: error.isRetryable,
      requestId,
      ...(error.details ? { details: error.details } : {}),
    },
  };
}

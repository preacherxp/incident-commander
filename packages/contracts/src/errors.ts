export const REJECTION_REASONS = [
  "RUN_TERMINAL",
  "WRONG_PHASE",
  "CARD_NOT_IN_HAND",
  "INSUFFICIENT_FOCUS",
  "UNKNOWN_CARD",
  "UNKNOWN_COMMAND",
  "NOT_IN_DRAFT",
  "INVALID_INPUT",
  "IDEMPOTENCY_CONFLICT",
  "INPUT_LIMIT_REACHED",
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export const API_ERROR_CODES = [
  "INVALID_REQUEST",
  "GUEST_SESSION_REQUIRED",
  "ORIGIN_REJECTED",
  "RUN_NOT_FOUND",
  "REVISION_CONFLICT",
  "RUN_FINALIZED",
  "IDEMPOTENCY_KEY_REUSED",
  "INPUT_ALREADY_RECORDED",
  "VERSION_UNAVAILABLE",
  "RUN_INPUT_LIMIT",
  "PAYLOAD_TOO_LARGE",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    retryable: boolean;
    requestId: string;
    details?: Record<string, unknown>;
  };
};

import type {
  CreateRunRequest,
  RunInput,
  RunOutcome,
  ScenarioManifestEntry,
  SyncResponse,
  VoiceRequest,
  VoiceResponse,
} from "@incident-commander/contracts";

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, retryable: boolean, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let code = "SERVICE_UNAVAILABLE";
    let message = response.statusText;
    let retryable = response.status >= 500;
    let details: Record<string, unknown> | undefined;
    try {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string; retryable?: boolean; details?: Record<string, unknown> };
      };
      if (body.error) {
        code = body.error.code ?? code;
        message = body.error.message ?? message;
        retryable = body.error.retryable ?? retryable;
        details = body.error.details;
      }
    } catch {
      // non-JSON error body
    }
    throw new ApiClientError(response.status, code, message, retryable, details);
  }
  return (await response.json()) as T;
}

export async function ensureGuestSession(): Promise<{ guestId: string; expiresAt: string }> {
  return request("/api/v1/guest-session", { method: "POST" });
}

export async function fetchScenarios(): Promise<ScenarioManifestEntry[]> {
  return request("/api/v1/scenarios");
}

export async function createRun(
  body: CreateRunRequest,
): Promise<{ runId: string; revision: number; created: boolean; checkpoint: { tick: number; throughSeq: number; state: unknown } }> {
  return request("/api/v1/runs", { method: "POST", body: JSON.stringify(body) });
}

export async function syncRun(
  runId: string,
  body: {
    batchId: string;
    baseRevision: number;
    inputs: RunInput[];
    checkpoint: { tick: number; throughSeq: number; state: unknown };
  },
): Promise<SyncResponse> {
  return request(`/api/v1/runs/${runId}/sync`, { method: "POST", body: JSON.stringify(body) });
}

export async function finalizeRun(
  runId: string,
  body: {
    batchId: string;
    baseRevision: number;
    inputs: RunInput[];
    checkpoint: { tick: number; throughSeq: number; state: unknown };
    outcome: RunOutcome;
  },
): Promise<SyncResponse> {
  return request(`/api/v1/runs/${runId}/finalize`, { method: "POST", body: JSON.stringify(body) });
}

export async function jevVoice(body: VoiceRequest): Promise<VoiceResponse> {
  return request("/api/v1/jev/voice", { method: "POST", body: JSON.stringify(body) });
}

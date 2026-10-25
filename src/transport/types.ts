export interface ToolArguments {
  path?: Record<string, unknown>;
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  body?: unknown;
}

export interface RateLimitSnapshot {
  limit: number | null;
  remaining: number | null;
  reset: number | null;
  policy: string | null;
}

export type TransportErrorCode =
  | "configuration"
  | "invalid_input"
  | "cancelled"
  | "timeout"
  | "network"
  | "redirect"
  | "response_too_large"
  | "invalid_response"
  | "http";

export interface TransportErrorDetails {
  code: TransportErrorCode;
  message: string;
  retryAfterMs: number | null;
}

export interface EtoroCallResult {
  operationId: string;
  requestId: string;
  status: number | null;
  ok: boolean;
  data: unknown;
  contentType: string | null;
  rateLimit: RateLimitSnapshot;
  error: TransportErrorDetails | null;
}

export type DiagnosticLevel = "debug" | "info" | "warn" | "error";

export interface DiagnosticEvent {
  level: DiagnosticLevel;
  message: string;
  operationId?: string;
  requestId?: string;
  method?: string;
  pathTemplate?: string;
  status?: number | null;
  durationMs?: number;
  attempt?: number;
}

export type DiagnosticSink = (event: DiagnosticEvent) => void;

export function failedCallResult(
  operationId: string,
  requestId: string,
  error: TransportErrorDetails,
  status: number | null = null,
  data: unknown = null,
): EtoroCallResult {
  return {
    operationId,
    requestId,
    status,
    ok: false,
    data,
    contentType: null,
    rateLimit: { limit: null, remaining: null, reset: null, policy: null },
    error,
  };
}

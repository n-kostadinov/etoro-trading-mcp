import { randomUUID } from "node:crypto";
import type { CatalogOperation } from "../catalog/types.js";
import type { RuntimeSettings } from "../config/types.js";
import { isRecord } from "../openapi/model.js";
import { credentialSecrets, redactSecrets, type CredentialConfiguration } from "./credentials.js";
import { SharedRateLimiter } from "./rate-limiter.js";
import {
  serializeRequest,
  TransportSerializationError,
  type SerializedRequest,
} from "./request-serialization.js";
import {
  failedCallResult,
  type DiagnosticEvent,
  type DiagnosticSink,
  type EtoroCallResult,
  type EtoroTransport,
  type RateLimitSnapshot,
  type ToolArguments,
  type TransportErrorDetails,
} from "./types.js";

export const ETORO_API_ORIGIN = "https://public-api.etoro.com";

export interface FetchTransportOptions {
  credentials: CredentialConfiguration;
  settings: Pick<RuntimeSettings, "requestTimeoutMs" | "maxResponseBytes">;
  baseUrl?: string;
  userAgent?: string;
  onDiagnostic?: DiagnosticSink;
  fetchImplementation?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  createRequestId?: () => string;
  random?: () => number;
}

interface AttemptOutcome {
  result: EtoroCallResult;
  retryable: boolean;
  retryAfterMs: number;
}

const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);
const MAX_RETRY_ATTEMPTS = 2;

class ResponseTooLargeError extends Error {
  constructor(maximumBytes: number) {
    super(`Response exceeds ${maximumBytes} bytes`);
    this.name = "ResponseTooLargeError";
  }
}

function parseRateLimitSnapshot(response: Response): RateLimitSnapshot {
  const parseInteger = (name: string): number | null => {
    const value = response.headers.get(name);
    if (value === null) {
      return null;
    }
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  };
  return {
    limit: parseInteger("ratelimit-limit"),
    remaining: parseInteger("ratelimit-remaining"),
    reset: parseInteger("ratelimit-reset"),
    policy: response.headers.get("ratelimit-policy"),
  };
}

function retryAfterMilliseconds(response: Response): number | null {
  const value = response.headers.get("retry-after");
  if (value === null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed * 1000 : null;
}

async function readBoundedBody(response: Response, maximumBytes: number): Promise<Buffer | null> {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > maximumBytes) {
    throw new ResponseTooLargeError(maximumBytes);
  }
  if (response.body === null) {
    return null;
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value === undefined) {
      continue;
    }
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new ResponseTooLargeError(maximumBytes);
    }
    chunks.push(Buffer.from(value));
  }
  return chunks.length === 0 ? null : Buffer.concat(chunks);
}

function parseResponseBody(contentType: string | null, body: Buffer | null): unknown {
  if (body === null || body.byteLength === 0) {
    return null;
  }
  if (contentType?.includes("json") ?? false) {
    try {
      return JSON.parse(body.toString("utf8")) as unknown;
    } catch {
      return body.toString("utf8");
    }
  }
  return body.toString("utf8");
}

function upstreamErrorMessage(status: number, data: unknown): string {
  if (isRecord(data)) {
    const parts = [
      typeof data.errorCode === "string" ? data.errorCode : undefined,
      typeof data.errorMessage === "string" ? data.errorMessage : undefined,
      typeof data.title === "string" ? data.title : undefined,
      typeof data.detail === "string" ? data.detail : undefined,
    ].filter((part): part is string => part !== undefined);
    if (parts.length > 0) {
      return `eToro returned HTTP ${status}: ${parts.join(" - ")}`;
    }
  }
  return `eToro returned HTTP ${status}`;
}

export class FetchEtoroTransport implements EtoroTransport {
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly fetchImplementation: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;
  private readonly createRequestId: () => string;
  private readonly random: () => number;
  private readonly rateLimiter: SharedRateLimiter;
  private readonly secrets: string[];

  constructor(private readonly options: FetchTransportOptions) {
    this.baseUrl = options.baseUrl ?? ETORO_API_ORIGIN;
    this.userAgent = options.userAgent ?? "etoro-trading-mcp/1.0.0";
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.sleep =
      options.sleep ??
      (async (milliseconds: number) => {
        await new Promise((resolve) => setTimeout(resolve, milliseconds));
      });
    this.now = options.now ?? (() => Date.now());
    this.createRequestId = options.createRequestId ?? randomUUID;
    this.random = options.random ?? Math.random;
    this.rateLimiter = new SharedRateLimiter(this.now);
    this.secrets = credentialSecrets(options.credentials);
  }

  async execute(
    operation: CatalogOperation,
    args: ToolArguments,
    signal?: AbortSignal,
  ): Promise<EtoroCallResult> {
    if (this.options.credentials === null) {
      return failedCallResult(operation.operationId, this.createRequestId(), {
        code: "configuration",
        message:
          "eToro credentials are not configured. Set ETORO_API_KEY and ETORO_USER_KEY, or ETORO_ACCESS_TOKEN.",
        retryAfterMs: null,
      });
    }

    let request: SerializedRequest;
    try {
      request = await serializeRequest(
        operation,
        args,
        this.options.credentials,
        this.userAgent,
        this.createRequestId,
      );
    } catch (error) {
      const message =
        error instanceof TransportSerializationError
          ? error.message
          : `Unable to serialize request: ${String(error)}`;
      return failedCallResult(operation.operationId, this.createRequestId(), {
        code: "invalid_input",
        message: this.redact(message),
        retryAfterMs: null,
      });
    }

    const operationIdentity = `${operation.method} ${operation.path}`;
    const localRate = this.rateLimiter.acquire(operation.rateLimit, operationIdentity);
    if (!localRate.allowed) {
      this.diagnostic({
        level: "warn",
        message: "Local shared rate limit exhausted",
        operationId: operation.operationId,
        requestId: request.requestId,
        method: operation.method,
        pathTemplate: operation.path,
        status: 429,
      });
      return failedCallResult(
        operation.operationId,
        request.requestId,
        {
          code: "http",
          message: `Local rate limit for this shared pool is exhausted; retry after ${localRate.retryAfterMs} ms`,
          retryAfterMs: localRate.retryAfterMs,
        },
        429,
      );
    }

    for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
      const startedAt = this.now();
      const outcome = await this.attemptRequest(operation, request, signal, attempt, startedAt);
      if (!outcome.retryable || attempt === MAX_RETRY_ATTEMPTS) {
        return outcome.result;
      }
      const delay = Math.min(
        outcome.retryAfterMs > 0
          ? outcome.retryAfterMs
          : 250 * 2 ** attempt + Math.floor(this.random() * 100),
        this.options.settings.requestTimeoutMs,
      );
      if (delay >= this.options.settings.requestTimeoutMs) {
        return outcome.result;
      }
      this.diagnostic({
        level: "warn",
        message: `Retrying read-only request after ${delay} ms`,
        operationId: operation.operationId,
        requestId: request.requestId,
        method: operation.method,
        pathTemplate: operation.path,
        status: outcome.result.status,
        attempt: attempt + 1,
      });
      await this.sleep(delay);
    }
    throw new Error("Retry loop exited without a result");
  }

  private async attemptRequest(
    operation: CatalogOperation,
    request: SerializedRequest,
    signal: AbortSignal | undefined,
    attempt: number,
    startedAt: number,
  ): Promise<AttemptOutcome> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort("timeout"),
      this.options.settings.requestTimeoutMs,
    );
    const cancel = () => controller.abort("cancelled");
    signal?.addEventListener("abort", cancel, { once: true });
    const query = request.query.length > 0 ? `?${request.query}` : "";
    const url = `${this.baseUrl}${request.path}${query}`;
    const operationIdentity = `${operation.method} ${operation.path}`;
    try {
      const response = await this.fetchImplementation(url, {
        method: request.method,
        headers: request.headers,
        ...(request.body === undefined ? {} : { body: request.body }),
        redirect: "error",
        signal: controller.signal,
      });
      const rateLimit = parseRateLimitSnapshot(response);
      this.rateLimiter.update(operation.rateLimit, operationIdentity, {
        remaining: rateLimit.remaining,
        resetSeconds: rateLimit.reset,
      });
      let body: Buffer | null;
      try {
        body = await readBoundedBody(response, this.options.settings.maxResponseBytes);
      } catch (error) {
        const result = failedCallResult(
          operation.operationId,
          request.requestId,
          {
            code: "response_too_large",
            message: this.redact(
              error instanceof Error ? error.message : "Response exceeded the configured bound",
            ),
            retryAfterMs: null,
          },
          response.status,
        );
        this.diagnostic({
          level: "warn",
          message: "Response exceeded configured size bound",
          operationId: operation.operationId,
          requestId: request.requestId,
          method: operation.method,
          pathTemplate: operation.path,
          status: response.status,
          durationMs: this.now() - startedAt,
          attempt,
        });
        return { result, retryable: false, retryAfterMs: 0 };
      }
      const contentType = response.headers.get("content-type");
      const data = parseResponseBody(contentType, body);
      const ok = response.status >= 200 && response.status < 300;
      const result: EtoroCallResult = {
        operationId: operation.operationId,
        requestId: request.requestId,
        status: response.status,
        ok,
        data,
        contentType,
        rateLimit,
        error: ok
          ? null
          : {
              code: "http",
              message: this.redact(upstreamErrorMessage(response.status, data)),
              retryAfterMs: retryAfterMilliseconds(response),
            },
      };
      this.diagnostic({
        level: ok ? "debug" : response.status === 429 ? "warn" : "error",
        message: ok ? "eToro request completed" : "eToro request returned an error",
        operationId: operation.operationId,
        requestId: request.requestId,
        method: operation.method,
        pathTemplate: operation.path,
        status: response.status,
        durationMs: this.now() - startedAt,
        attempt,
      });
      return {
        result,
        retryable: operation.readOnly && RETRYABLE_STATUS_CODES.has(response.status),
        retryAfterMs: retryAfterMilliseconds(response) ?? 0,
      };
    } catch (error) {
      const abortedReason = controller.signal.reason;
      const causeMessage =
        error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
      const isRedirectRejection =
        error instanceof TypeError &&
        `${error.message} ${causeMessage}`.toLowerCase().includes("redirect");
      const details: TransportErrorDetails =
        abortedReason === "cancelled"
          ? { code: "cancelled", message: "MCP client cancelled the tool call", retryAfterMs: null }
          : abortedReason === "timeout"
            ? {
                code: "timeout",
                message: `Request exceeded ${this.options.settings.requestTimeoutMs} ms`,
                retryAfterMs: null,
              }
            : isRedirectRejection
              ? {
                  code: "redirect",
                  message:
                    "eToro returned a redirect; redirects are rejected to protect credentials",
                  retryAfterMs: null,
                }
              : {
                  code: "network",
                  message: this.redact(
                    `Network request failed: ${error instanceof Error ? error.message : String(error)}`,
                  ),
                  retryAfterMs: null,
                };
      if (
        !operation.readOnly &&
        (details.code === "timeout" || details.code === "network" || details.code === "cancelled")
      ) {
        details.message +=
          ". The request may have reached eToro; check its outcome with the appropriate read or lookup operation before retrying with the same x-request-id.";
      }
      const result = failedCallResult(operation.operationId, request.requestId, details, null);
      this.diagnostic({
        level: "error",
        message: details.message,
        operationId: operation.operationId,
        requestId: request.requestId,
        method: operation.method,
        pathTemplate: operation.path,
        status: null,
        durationMs: this.now() - startedAt,
        attempt,
      });
      return {
        result,
        retryable: operation.readOnly && details.code === "network",
        retryAfterMs: 0,
      };
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
    }
  }

  private redact(message: string): string {
    return redactSecrets(message, this.secrets);
  }

  private diagnostic(event: DiagnosticEvent): void {
    this.options.onDiagnostic?.(event);
  }
}

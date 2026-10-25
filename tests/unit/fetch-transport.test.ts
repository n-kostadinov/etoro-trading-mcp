import { describe, expect, it } from "vitest";
import catalog from "../../src/generated/tool-catalog.js";
import { FetchEtoroTransport } from "../../src/transport/fetch-transport.js";
import type { CredentialConfiguration } from "../../src/transport/credentials.js";

const credentials: CredentialConfiguration = {
  type: "bearer",
  token: "bearer-secret",
};

function operation(operationId: string) {
  const found = catalog.operations.find((candidate) => candidate.operationId === operationId);
  if (found === undefined) {
    throw new Error(`Missing operation ${operationId}`);
  }
  return found;
}

interface RecordedCall {
  url: string;
  init: RequestInit;
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function createTransport(options: {
  responder: (call: RecordedCall) => Promise<Response>;
  maxResponseBytes?: number;
  credentials?: CredentialConfiguration;
  readOnly?: boolean;
}) {
  const calls: RecordedCall[] = [];
  const suppliedCredentials = Object.hasOwn(options, "credentials")
    ? options.credentials
    : undefined;
  const transportCredentials =
    suppliedCredentials === undefined ? credentials : suppliedCredentials;
  const transport = new FetchEtoroTransport({
    credentials: transportCredentials,
    settings: {
      requestTimeoutMs: 1000,
      maxResponseBytes: options.maxResponseBytes ?? 1024 * 1024,
    },
    fetchImplementation: async (url, init) => {
      const call = { url: String(url), init: init ?? {} };
      calls.push(call);
      return options.responder(call);
    },
    sleep: async () => {},
    createRequestId: () => "11111111-1111-4111-8111-111111111111",
  });
  return { calls, transport };
}

describe("fetch transport behavior", () => {
  it("returns a structured success envelope with safe rate-limit metadata", async () => {
    const { calls, transport } = createTransport({
      responder: async () =>
        jsonResponse({ results: [] }, 200, {
          "ratelimit-limit": "120",
          "ratelimit-remaining": "119",
          "ratelimit-reset": "30",
          "ratelimit-policy": "120;w=60",
        }),
    });
    const result = await transport.execute(operation("getRates"), {
      query: { instrumentIds: [1] },
    });
    expect(result).toMatchObject({
      operationId: "getRates",
      requestId: "11111111-1111-4111-8111-111111111111",
      status: 200,
      ok: true,
      data: { results: [] },
      contentType: "application/json",
      rateLimit: { limit: 120, remaining: 119, reset: 30, policy: "120;w=60" },
      error: null,
    });
    expect(calls[0]?.init.headers).toMatchObject({ authorization: "Bearer bearer-secret" });
  });

  it("preserves upstream HTTP errors and eToro error payloads", async () => {
    const { transport } = createTransport({
      responder: async () =>
        jsonResponse({ errorCode: "Unauthorized", errorMessage: "Invalid key" }, 401),
    });
    const result = await transport.execute(operation("getRates"), {
      query: { instrumentIds: [1] },
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error).toMatchObject({ code: "http", retryAfterMs: null });
    expect(result.error?.message).toContain("Unauthorized - Invalid key");
  });

  it("blocks a second call when a shared-pool response reports no remaining quota", async () => {
    const { calls, transport } = createTransport({
      responder: async () =>
        jsonResponse({}, 200, { "ratelimit-remaining": "0", "ratelimit-reset": "45" }),
    });
    const first = await transport.execute(operation("getRates"), { query: { instrumentIds: [1] } });
    const second = await transport.execute(operation("getRates"), {
      query: { instrumentIds: [2] },
    });
    expect(first.ok).toBe(true);
    expect(second).toMatchObject({
      ok: false,
      status: 429,
      requestId: "11111111-1111-4111-8111-111111111111",
    });
    expect(second.error?.retryAfterMs).toBeGreaterThan(0);
    expect(calls).toHaveLength(1);
  });

  it("retries only read-only operations with the same request ID", async () => {
    let attempts = 0;
    const { calls, transport } = createTransport({
      responder: async () => {
        attempts += 1;
        return attempts === 1 ? jsonResponse({}, 502) : jsonResponse({ ok: true });
      },
    });
    const result = await transport.execute(operation("getRates"), {
      query: { instrumentIds: [1] },
    });
    expect(result.ok).toBe(true);
    expect(attempts).toBe(2);
    expect(calls.map((call) => call.init.headers)).toHaveLength(2);
    expect(new Set(calls.map((call) => call.init.headers)).size).toBe(1);

    const mutation = createTransport({
      responder: async () => {
        throw new Error("connection dropped after bearer-secret");
      },
    });
    const mutationResult = await mutation.transport.execute(
      operation("createTradingExecutionDemoOrdersV3"),
      {
        body: { action: "open", transaction: "buy", instrumentId: 1, orderType: "mkt", amount: 1 },
      },
    );
    expect(mutationResult.ok).toBe(false);
    expect(mutationResult.error?.code).toBe("network");
    expect(mutationResult.error?.message).toContain("[redacted]");
    expect(mutationResult.error?.message).toContain("same x-request-id");
    expect(mutation.calls).toHaveLength(1);
  });

  it("supports documented empty and multi-status success responses", async () => {
    for (const status of [202, 204, 206, 207]) {
      const { transport } = createTransport({
        responder: async () => new Response(status === 204 ? null : "{}", { status }),
      });
      const result = await transport.execute(operation("getRates"), {
        query: { instrumentIds: [1] },
      });
      expect(result.status).toBe(status);
      expect(result.ok).toBe(true);
    }
  });

  it("bounds response bodies and classifies malformed JSON as text data", async () => {
    const bounded = createTransport({
      responder: async () => new Response("x".repeat(32), { status: 200 }),
      maxResponseBytes: 8,
    });
    const boundedResult = await bounded.transport.execute(operation("getRates"), {
      query: { instrumentIds: [1] },
    });
    expect(boundedResult.error?.code).toBe("response_too_large");

    const malformed = createTransport({
      responder: async () =>
        new Response("{broken", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    const malformedResult = await malformed.transport.execute(operation("getRates"), {
      query: { instrumentIds: [1] },
    });
    expect(malformedResult.ok).toBe(true);
    expect(malformedResult.data).toBe("{broken");
  });

  it("returns a configuration error before any fetch when credentials are absent", async () => {
    const { calls, transport } = createTransport({
      credentials: null,
      responder: async () => {
        throw new Error("fetch must not run");
      },
    });
    const result = await transport.execute(operation("getRates"), {
      query: { instrumentIds: [1] },
    });
    expect(result.error?.code).toBe("configuration");
    expect(result.error?.message).toContain("ETORO_API_KEY");
    expect(calls).toHaveLength(0);
  });
});

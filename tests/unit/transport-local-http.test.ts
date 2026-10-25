import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import catalog from "../../src/generated/tool-catalog.js";
import { FetchEtoroTransport } from "../../src/transport/fetch-transport.js";

let server: Server;
let baseUrl: string;

function operation(operationId: string) {
  const found = catalog.operations.find((candidate) => candidate.operationId === operationId);
  if (found === undefined) {
    throw new Error(`Missing operation ${operationId}`);
  }
  return found;
}

beforeEach(async () => {
  server = createServer((request, response) => {
    if (request.url?.includes("instrumentIds=redirect")) {
      response.writeHead(302, { location: "https://example.com/redirect-target" });
      response.end();
      return;
    }
    if (request.url?.includes("instrumentIds=empty")) {
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.url?.includes("instrumentIds=hang")) {
      return;
    }
    response.writeHead(200, {
      "content-type": "application/json",
      "ratelimit-limit": "120",
      "ratelimit-remaining": "119",
      "ratelimit-reset": "30",
    });
    response.end('{"results":[]}');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("transport over a real local HTTP boundary", () => {
  it("completes JSON and empty responses from a local server", async () => {
    const transport = new FetchEtoroTransport({
      credentials: { type: "apiKey", apiKey: "app", userKey: "user" },
      settings: { requestTimeoutMs: 1000, maxResponseBytes: 1024 * 1024 },
      baseUrl,
      createRequestId: () => "11111111-1111-4111-8111-111111111111",
    });
    const success = await transport.execute(operation("getRates"), {
      query: { instrumentIds: [1] },
    });
    expect(success).toMatchObject({ ok: true, status: 200, data: { results: [] } });
    const empty = await transport.execute(operation("getRates"), {
      query: { instrumentIds: ["empty"] },
    });
    expect(empty).toMatchObject({ ok: true, status: 204, data: null });
  });

  it("rejects redirects so credentials cannot follow to another origin", async () => {
    const transport = new FetchEtoroTransport({
      credentials: { type: "bearer", token: "token" },
      settings: { requestTimeoutMs: 1000, maxResponseBytes: 1024 },
      baseUrl,
    });
    const result = await transport.execute(operation("getRates"), {
      query: { instrumentIds: ["redirect"] },
    });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("redirect");
  });

  it("classifies an elapsed request timeout", async () => {
    const transport = new FetchEtoroTransport({
      credentials: { type: "apiKey", apiKey: "app", userKey: "user" },
      settings: { requestTimeoutMs: 20, maxResponseBytes: 1024 },
      baseUrl,
    });
    const result = await transport.execute(operation("getRates"), {
      query: { instrumentIds: ["hang"] },
    });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("timeout");
  });
});

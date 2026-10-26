import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/server";
import { runCli } from "../../src/cli.js";
import catalogModule from "../../src/generated/tool-catalog.js";
import type { CatalogOperation } from "../../src/catalog/types.js";
import { loadConfiguration } from "../../src/config/configuration.js";
import { readCredentialConfiguration } from "../../src/transport/credentials.js";
import { startMcpServer, type ServerHandle } from "../../src/mcp/start-server.js";
import type { EtoroCallResult, EtoroTransport, ToolArguments } from "../../src/transport/types.js";
import { validArgumentsForOperation, type SampleContext } from "./sample-arguments.js";

const require = createRequire(import.meta.url);
const { version: packageVersion } = require("../../package.json") as {
  version: string;
};

interface RecordedRequest {
  operationId: string;
  method: string;
  path: string;
  args: ToolArguments;
}

class LineJsonRpcClient {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private buffer = "";
  readonly nonJsonLines: string[] = [];

  constructor(
    private readonly inputStream: PassThrough,
    outputStream: PassThrough,
  ) {
    outputStream.setEncoding("utf8");
    outputStream.on("data", (chunk: string) => {
      this.buffer += chunk;
      let newline = this.buffer.indexOf("\n");
      while (newline !== -1) {
        const line = this.buffer.slice(0, newline).trim();
        this.buffer = this.buffer.slice(newline + 1);
        if (line.length > 0) {
          this.handleLine(line);
        }
        newline = this.buffer.indexOf("\n");
      }
    });
  }

  private handleLine(line: string): void {
    let message: { id?: number; error?: { message: string }; result?: unknown };
    try {
      message = JSON.parse(line);
    } catch {
      this.nonJsonLines.push(line);
      return;
    }
    if (message.id === undefined || !this.pending.has(message.id)) {
      return;
    }
    const pending = this.pending.get(message.id);
    this.pending.delete(message.id);
    if (pending === undefined) {
      return;
    }
    if (message.error !== undefined) {
      pending.reject(new Error(message.error.message ?? "MCP request failed"));
    } else {
      pending.resolve(message.result);
    }
  }

  request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    const result = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.inputStream.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    return result;
  }

  notify(method: string): void {
    this.inputStream.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`);
  }
}

function fakeResult(operation: CatalogOperation): EtoroCallResult {
  return {
    operationId: operation.operationId,
    requestId: "11111111-1111-4111-8111-111111111111",
    status: 200,
    ok: true,
    data: { dispatched: operation.operationId },
    contentType: "application/json",
    rateLimit: { limit: 120, remaining: 119, reset: 30, policy: "120;w=60" },
    error: null,
  };
}

function recordingTransport(requests: RecordedRequest[]): EtoroTransport {
  return {
    execute: async (operation, args) => {
      requests.push({
        operationId: operation.operationId,
        method: operation.method,
        path: operation.path,
        args,
      });
      return fakeResult(operation);
    },
  };
}

async function startContractServer(environment: Record<string, string>) {
  const requests: RecordedRequest[] = [];
  const transport = recordingTransport(requests);
  const configuration = await loadConfiguration({
    env: environment,
    cli: {},
    cliConfigPath: null,
  });
  const serverInput = new PassThrough();
  const serverOutput = new PassThrough();
  const handle = await startMcpServer({
    settings: configuration.settings,
    catalog: catalogModule,
    credentials: readCredentialConfiguration(environment),
    stdin: serverInput,
    stdout: serverOutput,
    installSignalHandlers: false,
    transportFactory: () => transport,
  });
  const client = new LineJsonRpcClient(serverInput, serverOutput);
  const initialized = (await client.request("initialize", {
    protocolVersion: LATEST_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "integration-contract-client", version: "1.0.0" },
  })) as { serverInfo: { name: string; version: string } };
  client.notify("notifications/initialized");
  return { client, handle, initialized, requests, serverInput };
}

async function startServerThroughCli(args: string[], environment: Record<string, string>) {
  const requests: RecordedRequest[] = [];
  const transport = recordingTransport(requests);
  const transportLimits: Array<{ requestTimeoutMs: number; maxResponseBytes: number }> = [];
  const serverInput = new PassThrough();
  const serverOutput = new PassThrough();
  const cliStdout: string[] = [];
  const cliStderr: string[] = [];
  let resolveStarted: ((handle: ServerHandle) => void) | undefined;
  const started = new Promise<ServerHandle>((resolve) => {
    resolveStarted = resolve;
  });

  const exitCode = runCli(
    args,
    {
      stdout: (text) => cliStdout.push(text),
      stderr: (text) => cliStderr.push(text),
    },
    {
      env: environment,
      startServer: (options) =>
        startMcpServer({
          ...options,
          stdin: serverInput,
          stdout: serverOutput,
          installSignalHandlers: false,
          transportFactory: (_credentials, limits) => {
            transportLimits.push({ ...limits });
            return transport;
          },
        }).then((handle) => {
          resolveStarted?.(handle);
          return handle;
        }),
    },
  );
  const handle = await Promise.race([
    started,
    exitCode.then((code) => {
      throw new Error(`CLI exited ${code} before starting the server: ${cliStderr.join("\n")}`);
    }),
  ]);
  const client = new LineJsonRpcClient(serverInput, serverOutput);
  await client.request("initialize", {
    protocolVersion: LATEST_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "integration-cli-client", version: "1.0.0" },
  });
  client.notify("notifications/initialized");
  return {
    client,
    cliStderr,
    cliStdout,
    exitCode,
    handle,
    requests,
    serverInput,
    transportLimits,
  };
}

let temporaryDirectory: string;
let sampleContext: SampleContext;

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(path.join(tmpdir(), "etoro-mcp-integration-"));
  const attachmentFilePath = path.join(temporaryDirectory, "attachment.png");
  await writeFile(
    attachmentFilePath,
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
  );
  sampleContext = { attachmentFilePath };
});

afterEach(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

async function closeServer(serverInput: PassThrough, handle: ServerHandle): Promise<void> {
  serverInput.end();
  await handle.closed;
}

describe("MCP stdio contract", () => {
  it("exposes the 28-tool example set and rejects unlisted or invalid calls", async () => {
    const server = await startContractServer({
      ETORO_API_KEY: "integration-app-key",
      ETORO_USER_KEY: "integration-user-key",
      ETORO_ENABLED_TOOLSETS: "market-data,trading-demo",
    });
    try {
      expect(server.initialized.serverInfo).toEqual({
        name: "etoro-trading-mcp",
        version: packageVersion,
      });
      const listed = (await server.client.request("tools/list", {})) as {
        tools: { name: string }[];
      };
      expect(listed.tools).toHaveLength(28);
      expect(listed.tools.map((tool) => tool.name).sort()).toEqual(
        catalogModule.operations
          .filter(
            (operation) =>
              (operation.toolsetId === "market-data" || operation.toolsetId === "trading-demo") &&
              !operation.deprecated,
          )
          .map((operation) => operation.operationId)
          .sort(),
      );
      await expect(
        server.client.request("tools/call", { name: "getMe", arguments: {} }),
      ).rejects.toThrow(/getMe/u);
      const invalid = (await server.client.request("tools/call", {
        name: "getRates",
        arguments: {},
      })) as { isError?: boolean; content?: { type: string; text?: string }[] };
      expect(invalid.isError).toBe(true);
      expect(invalid.content?.[0]?.text).toContain("required property 'query'");
      expect(server.requests).toHaveLength(0);
      expect(server.client.nonJsonLines).toEqual([]);
    } finally {
      await closeServer(server.serverInput, server.handle);
    }
  });

  it("applies CLI safety negation and request limits to the composed stdio server", async () => {
    const server = await startServerThroughCli(
      ["--no-allow-real-money", "--timeout-ms", "44444", "--max-response-bytes", "12345678"],
      {
        ETORO_API_KEY: "integration-app-key",
        ETORO_USER_KEY: "integration-user-key",
        ETORO_ENABLED_TOOLSETS: "market-data,trading-real",
        ETORO_ALLOW_REAL_MONEY: "true",
      },
    );
    const realMoneyOperation = catalogModule.operations.find(
      (operation) => operation.operationId === "createTradingExecutionOrders",
    );
    const ratesOperation = catalogModule.operations.find(
      (operation) => operation.operationId === "getRates",
    );
    if (realMoneyOperation === undefined || ratesOperation === undefined) {
      throw new Error("Expected catalog operations were not found");
    }
    try {
      const listed = (await server.client.request("tools/list", {})) as {
        tools: { name: string }[];
      };
      const toolNames = listed.tools.map((tool) => tool.name);
      expect(toolNames).toContain("getTradingInfoRealPnl");
      expect(toolNames).not.toContain(realMoneyOperation.operationId);
      await expect(
        server.client.request("tools/call", {
          name: realMoneyOperation.operationId,
          arguments: validArgumentsForOperation(realMoneyOperation, sampleContext),
        }),
      ).rejects.toThrow(/createTradingExecutionOrders/u);

      const ratesResult = (await server.client.request("tools/call", {
        name: ratesOperation.operationId,
        arguments: validArgumentsForOperation(ratesOperation, sampleContext),
      })) as { structuredContent?: EtoroCallResult };
      expect(ratesResult.structuredContent?.ok).toBe(true);
      expect(server.requests.map((request) => request.operationId)).toEqual([
        ratesOperation.operationId,
      ]);
      expect(server.transportLimits).toEqual([
        { requestTimeoutMs: 44444, maxResponseBytes: 12345678 },
      ]);
      expect(server.cliStdout).toEqual([]);
      expect(server.cliStderr).toEqual([]);
      expect(server.client.nonJsonLines).toEqual([]);
    } finally {
      server.serverInput.end();
      await server.handle.closed;
      await expect(server.exitCode).resolves.toBe(0);
    }
  });

  it("dispatches every catalog operation exactly once to its manifest request", async () => {
    const allToolsets = catalogModule.toolsets.map((toolset) => toolset.id).join(",");
    const server = await startContractServer({
      ETORO_ACCESS_TOKEN: "integration-access-token",
      ETORO_ENABLED_TOOLSETS: allToolsets,
      ETORO_INCLUDE_DEPRECATED: "true",
      ETORO_ALLOW_REAL_MONEY: "true",
    });
    try {
      const listed = (await server.client.request("tools/list", {})) as {
        tools: { name: string }[];
      };
      expect(listed.tools).toHaveLength(197);
      expect(new Set(listed.tools.map((tool) => tool.name)).size).toBe(197);

      const failures: string[] = [];
      for (const operation of catalogModule.operations) {
        const result = (await server.client.request("tools/call", {
          name: operation.operationId,
          arguments: validArgumentsForOperation(operation, sampleContext),
        })) as { isError?: boolean; structuredContent?: EtoroCallResult };
        if (result.isError === true || result.structuredContent?.ok !== true) {
          failures.push(operation.operationId);
        }
      }
      expect(failures).toEqual([]);

      expect(server.requests).toHaveLength(197);
      expect(new Set(server.requests.map((request) => request.operationId)).size).toBe(197);
      expect(server.requests.map((request) => `${request.method} ${request.path}`).sort()).toEqual(
        catalogModule.operations.map((operation) => `${operation.method} ${operation.path}`).sort(),
      );
      const rates = server.requests.find((request) => request.operationId === "getRates");
      expect(rates?.args.query).toEqual({ instrumentIds: [1] });
      expect(server.client.nonJsonLines).toEqual([]);
    } finally {
      await closeServer(server.serverInput, server.handle);
    }
  });
});

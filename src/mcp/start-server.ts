import { createRequire } from "node:module";
import type { Readable, Writable } from "node:stream";
import type { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import type { ToolCatalog } from "../catalog/types.js";
import type { RuntimeSettings } from "../config/types.js";
import { resolveToolRegistry } from "../registry/tool-registry.js";
import { FetchEtoroTransport } from "../transport/fetch-transport.js";
import type { CredentialConfiguration } from "../transport/credentials.js";
import type { DiagnosticSink, EtoroTransport } from "../transport/types.js";
import { createMcpServer } from "./create-server.js";
import { createStderrDiagnosticSink } from "./stderr-logger.js";

const require = createRequire(import.meta.url);
const packageMetadata = require("../../package.json") as { version: string };

export type TransportFactory = (
  credentials: CredentialConfiguration,
  settings: Pick<RuntimeSettings, "requestTimeoutMs" | "maxResponseBytes">,
  onDiagnostic: DiagnosticSink,
) => EtoroTransport;

export interface StartServerOptions {
  settings: RuntimeSettings;
  catalog: ToolCatalog;
  credentials: CredentialConfiguration;
  transportFactory?: TransportFactory;
  stdin?: Readable;
  stdout?: Writable;
  installSignalHandlers?: boolean;
}

export interface ServerHandle {
  server: McpServer;
  closed: Promise<void>;
  close: () => Promise<void>;
}

const defaultTransportFactory: TransportFactory = (credentials, settings, onDiagnostic) =>
  new FetchEtoroTransport({
    credentials,
    settings,
    userAgent: `etoro-trading-mcp/${packageMetadata.version}`,
    onDiagnostic,
  });

export async function startMcpServer(options: StartServerOptions): Promise<ServerHandle> {
  const registry = resolveToolRegistry(options.catalog, options.settings);
  const diagnosticSink = createStderrDiagnosticSink(options.settings.logLevel);
  for (const warning of registry.warnings) {
    diagnosticSink({ level: "warn", message: warning });
  }
  const transport = (options.transportFactory ?? defaultTransportFactory)(
    options.credentials,
    {
      requestTimeoutMs: options.settings.requestTimeoutMs,
      maxResponseBytes: options.settings.maxResponseBytes,
    },
    diagnosticSink,
  );
  const server = createMcpServer({
    operations: registry.enabledOperations,
    transport,
    version: packageMetadata.version,
  });
  const stdioTransport = new StdioServerTransport(options.stdin, options.stdout);
  await server.connect(stdioTransport);

  const shouldInstallSignalHandlers = options.installSignalHandlers ?? true;
  const shutdown = () => {
    void close();
  };
  let resolveClosed: (() => void) | undefined;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  let closeFinished = false;
  let closeOperation: Promise<void> | undefined;
  const finishClose = () => {
    if (closeFinished) {
      return;
    }
    closeFinished = true;
    if (shouldInstallSignalHandlers) {
      process.removeListener("SIGINT", shutdown);
      process.removeListener("SIGTERM", shutdown);
    }
    resolveClosed?.();
  };
  const close = (): Promise<void> => {
    closeOperation ??= (async () => {
      try {
        await server.close();
      } finally {
        finishClose();
      }
    })();
    return closeOperation;
  };
  const previousOnClose = stdioTransport.onclose;
  stdioTransport.onclose = () => {
    try {
      previousOnClose?.();
    } finally {
      finishClose();
    }
  };

  if (shouldInstallSignalHandlers) {
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  }

  return { server, closed, close };
}

import { createRequire } from "node:module";
import type { Readable, Writable } from "node:stream";
import type { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import catalogModule from "../generated/tool-catalog.js";
import type { ToolCatalog } from "../catalog/types.js";
import { loadConfiguration } from "../config/configuration.js";
import type { RuntimeSettings } from "../config/types.js";
import { resolveToolRegistry } from "../registry/tool-registry.js";
import { FetchEtoroTransport, type EtoroTransport } from "../transport/fetch-transport.js";
import {
  readCredentialConfiguration,
  type CredentialConfiguration,
} from "../transport/credentials.js";
import type { DiagnosticSink } from "../transport/types.js";
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
  env?: Record<string, string | undefined>;
  readFile?: ((path: string) => Promise<string>) | undefined;
  catalog?: ToolCatalog;
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
  const env = options.env ?? process.env;
  const credentials = readCredentialConfiguration(env);
  const configuration = await loadConfiguration({
    env,
    cli: {},
    cliConfigPath: null,
    readFile: options.readFile,
  });
  const catalog = options.catalog ?? catalogModule;
  const registry = resolveToolRegistry(catalog, configuration.settings);
  const diagnosticSink = createStderrDiagnosticSink(configuration.settings.logLevel);
  for (const warning of registry.warnings) {
    diagnosticSink({ level: "warn", message: warning });
  }
  const transport = (options.transportFactory ?? defaultTransportFactory)(
    credentials,
    {
      requestTimeoutMs: configuration.settings.requestTimeoutMs,
      maxResponseBytes: configuration.settings.maxResponseBytes,
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

  let resolveClosed: (() => void) | undefined;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  let closing = false;
  const close = async (): Promise<void> => {
    if (closing) {
      return;
    }
    closing = true;
    try {
      await server.close();
    } finally {
      resolveClosed?.();
    }
  };
  const previousOnClose = stdioTransport.onclose;
  stdioTransport.onclose = () => {
    previousOnClose?.();
    resolveClosed?.();
  };

  if (options.installSignalHandlers ?? true) {
    const shutdown = () => {
      void close();
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  }

  return { server, closed, close };
}

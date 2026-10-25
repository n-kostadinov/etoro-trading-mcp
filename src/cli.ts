#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import catalogModule from "./generated/tool-catalog.js";
import { parseCliArguments } from "./config/cli-arguments.js";
import { loadConfiguration } from "./config/configuration.js";
import type { RuntimeSettings } from "./config/types.js";
import type { ToolCatalog } from "./catalog/types.js";
import { resolveToolRegistry } from "./registry/tool-registry.js";
import { startMcpServer } from "./mcp/start-server.js";

const require = createRequire(import.meta.url);
const packageMetadata = require("../package.json") as { version: string };

const help = `etoro-trading-mcp ${packageMetadata.version}

Usage:
  etoro-trading-mcp [options]                       Start the local stdio MCP server
  etoro-trading-mcp tools list [options]            List effective MCP tools
  etoro-trading-mcp config validate [options]       Validate configuration without calling eToro
  etoro-trading-mcp --version
  etoro-trading-mcp --help

Tool selection:
  --enable-toolset <id>      Enable a toolset in addition to the defaults
  --disable-toolset <id>     Disable a toolset
  --enable-tool <operation>  Enable one operation even if its toolset is disabled
  --disable-tool <operation> Disable one operation; this wins over every enable rule
  --include-deprecated       Include legacy operations (default: false)
  --no-include-deprecated
  --allow-real-money         Permit selected real-money mutations (default: false)
  --no-allow-real-money

Runtime:
  --config <path>            Explicit JSON configuration file
  --timeout-ms <ms>          Per-request timeout (1000-600000, default 30000)
  --max-response-bytes <n>   Response size bound (default 26214400)
  --log-level <level>        error, warn, info, or debug (default info)

Output:
  --all                      With "tools list", show all catalog operations and states
  --json                     Machine-readable output for inspection commands

Configuration precedence is: built-in defaults < config file < environment < CLI.
Credentials are environment-only: ETORO_API_KEY + ETORO_USER_KEY, or ETORO_ACCESS_TOKEN.
`;

export interface CliOutput {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export interface CliDependencies {
  env?: Record<string, string | undefined>;
  readFile?: (path: string) => Promise<string>;
  catalog?: ToolCatalog;
}

function toolJson(status: {
  operationId: string;
  toolsetId: string;
  method: string;
  path: string;
  enabled: boolean;
  reason: string;
  blockedBy: string[];
}) {
  return { ...status, blockedBy: [...status.blockedBy] };
}

function printToolList(
  registry: ReturnType<typeof resolveToolRegistry>,
  catalog: ToolCatalog,
  all: boolean,
  json: boolean,
  output: CliOutput,
): void {
  const visible = all ? registry.statuses : registry.statuses.filter((status) => status.enabled);
  if (json) {
    output.stdout(
      JSON.stringify(
        {
          enabledCount: registry.enabledOperations.length,
          catalogOperationCount: catalog.operations.length,
          tools: visible.map(toolJson),
        },
        null,
        2,
      ),
    );
    return;
  }
  output.stdout(
    `Enabled tools: ${registry.enabledOperations.length} of ${catalog.operations.length} catalog operations`,
  );
  for (const status of visible) {
    const state = status.enabled ? "enabled" : status.reason;
    output.stdout(
      `${status.operationId}\t${status.toolsetId}\t${status.method} ${status.path}\t${state}`,
    );
  }
}

function printConfigValidation(
  registry: ReturnType<typeof resolveToolRegistry>,
  configPath: string | null,
  settings: RuntimeSettings,
  json: boolean,
  output: CliOutput,
): void {
  const selectedCount = registry.statuses.filter((status) => status.selected).length;
  const blockedCount = registry.statuses.filter((status) => status.blockedBy.length > 0).length;
  if (json) {
    output.stdout(
      JSON.stringify(
        {
          valid: true,
          configPath,
          settings,
          enabledToolsets: registry.enabledToolsets,
          counts: {
            catalogOperations: registry.statuses.length,
            selected: selectedCount,
            enabled: registry.enabledOperations.length,
            blocked: blockedCount,
          },
          warnings: registry.warnings,
        },
        null,
        2,
      ),
    );
    return;
  }
  output.stdout("Configuration is valid.");
  output.stdout(`Config file: ${configPath ?? "none"}`);
  output.stdout(`Enabled toolsets: ${registry.enabledToolsets.join(", ") || "none"}`);
  output.stdout(
    `Tools: ${registry.enabledOperations.length} enabled, ${selectedCount} selected, ${blockedCount} blocked, ${registry.statuses.length} catalog operations`,
  );
  for (const warning of registry.warnings) {
    output.stdout(`Warning: ${warning}`);
  }
}

export async function runCli(
  args: string[],
  output: CliOutput,
  dependencies: CliDependencies = {},
): Promise<number> {
  const catalog = dependencies.catalog ?? catalogModule;
  try {
    const invocation = parseCliArguments(args);
    if (invocation.command === "help") {
      output.stdout(help);
      return 0;
    }
    if (invocation.command === "version") {
      output.stdout(packageMetadata.version);
      return 0;
    }
    const configuration = await loadConfiguration({
      env: dependencies.env ?? process.env,
      cli: invocation.settings,
      cliConfigPath: invocation.configPath,
      readFile: dependencies.readFile,
    });
    const registry = resolveToolRegistry(catalog, configuration.settings);
    if (invocation.command === "tools-list") {
      printToolList(registry, catalog, invocation.all, invocation.json, output);
      return 0;
    }
    if (invocation.command === "config-validate") {
      printConfigValidation(
        registry,
        configuration.configPath,
        configuration.settings,
        invocation.json,
        output,
      );
      return 0;
    }
    const serverHandle = await startMcpServer({
      env: dependencies.env ?? process.env,
      readFile: dependencies.readFile,
    });
    await serverHandle.closed;
    return 0;
  } catch (error) {
    output.stderr(`etoro-trading-mcp: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

// The ESM loader resolves symlinks when it computes import.meta.url, so the
// entry path must be resolved the same way before comparing (for example macOS
// temp directories sit behind the /var -> /private/var symlink).
const invokedAsBinary =
  process.argv[1] !== undefined &&
  pathToFileURL(realpathSync(path.resolve(process.argv[1]))).href === import.meta.url;

if (invokedAsBinary) {
  const args = process.argv.slice(2);
  process.exitCode = await runCli(args, {
    stdout: (text) => process.stdout.write(`${text}\n`),
    stderr: (text) => process.stderr.write(`${text}\n`),
  });
}

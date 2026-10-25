import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli.js";
import catalogModule from "../../src/generated/tool-catalog.js";
import type { ToolCatalog } from "../../src/catalog/types.js";
import type { StartServerOptions } from "../../src/mcp/start-server.js";

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    output: {
      stdout: (text: string) => stdout.push(text),
      stderr: (text: string) => stderr.push(text),
    },
    stderrText: () => stderr.join("\n"),
  };
}

function configurationReader(files: Record<string, string>) {
  return async (path: string): Promise<string> => {
    if (path.replaceAll("\\", "/").endsWith("schemas/config.schema.json")) {
      return readFile(path, "utf8");
    }
    const content = files[path];
    if (content === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return content;
  };
}

describe("CLI to server composition", () => {
  it("forwards one CLI-effective configuration snapshot, credentials, and catalog to startup", async () => {
    const customCatalog: ToolCatalog = { ...catalogModule };
    const starts: StartServerOptions[] = [];
    const configurationReadPaths: string[] = [];
    const reader = configurationReader({
      "server-config.json": JSON.stringify({
        enabledToolsets: ["watchlists"],
        disabledToolsets: ["trading-demo"],
        requestTimeoutMs: 20000,
        maxResponseBytes: 2097152,
        logLevel: "warn",
      }),
    });
    const cli = capture();
    const exitCode = await runCli(
      [
        "--config",
        "server-config.json",
        "--no-include-deprecated",
        "--no-allow-real-money",
        "--disable-tool",
        "getMe",
        "--timeout-ms",
        "45000",
        "--max-response-bytes",
        "1048576",
        "--log-level",
        "debug",
      ],
      cli.output,
      {
        env: {
          ETORO_ENABLED_TOOLSETS: "balances",
          ETORO_ALLOW_REAL_MONEY: "true",
          ETORO_INCLUDE_DEPRECATED: "true",
          ETORO_TIMEOUT_MS: "30000",
          ETORO_MAX_RESPONSE_BYTES: "3145728",
          ETORO_LOG_LEVEL: "error",
          ETORO_API_KEY: "app-secret",
          ETORO_USER_KEY: "user-secret",
        },
        readFile: async (path: string) => {
          configurationReadPaths.push(path);
          return reader(path);
        },
        catalog: customCatalog,
        startServer: async (options) => {
          starts.push(options);
          return { closed: Promise.resolve() };
        },
      },
    );

    expect(exitCode).toBe(0);
    expect(starts).toHaveLength(1);
    expect(starts[0]?.settings).toEqual({
      enabledToolsets: ["balances"],
      disabledToolsets: ["trading-demo"],
      enabledTools: [],
      disabledTools: ["getMe"],
      includeDeprecated: false,
      allowRealMoney: false,
      requestTimeoutMs: 45000,
      maxResponseBytes: 1048576,
      logLevel: "debug",
    });
    expect(starts[0]?.catalog).toBe(customCatalog);
    expect(starts[0]?.credentials).toEqual({
      type: "apiKey",
      apiKey: "app-secret",
      userKey: "user-secret",
    });
    expect(configurationReadPaths.filter((path) => path === "server-config.json")).toHaveLength(1);
    expect(
      configurationReadPaths.filter((path) =>
        path.replaceAll("\\", "/").endsWith("schemas/config.schema.json"),
      ),
    ).toHaveLength(1);
  });

  it("keeps inspection commands credential-free and does not start a server", async () => {
    const starts: StartServerOptions[] = [];
    const cli = capture();
    const exitCode = await runCli(["config", "validate", "--json"], cli.output, {
      env: {
        ETORO_API_KEY: "app-secret",
        ETORO_USER_KEY: "user-secret",
      },
      startServer: async (options) => {
        starts.push(options);
        return { closed: Promise.resolve() };
      },
    });

    expect(exitCode).toBe(0);
    expect(starts).toHaveLength(0);
    expect(cli.stderrText()).toBe("");
  });
});

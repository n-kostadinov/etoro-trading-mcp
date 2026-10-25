import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadConfiguration } from "../../src/config/configuration.js";

const configSchema = JSON.parse(
  await readFile(new URL("../../schemas/config.schema.json", import.meta.url), "utf8"),
) as unknown;

function fileReader(files: Record<string, string>): (path: string) => Promise<string> {
  return async (path: string) => {
    const content = files[path];
    if (content === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return content;
  };
}

describe("layered configuration loading", () => {
  it("applies property-level precedence and replaces lower-layer arrays", async () => {
    const result = await loadConfiguration({
      env: {
        ETORO_ENABLED_TOOLSETS: "identity",
        ETORO_TIMEOUT_MS: "5000",
      },
      cli: {
        enabledTools: ["getMe"],
        includeDeprecated: true,
        requestTimeoutMs: 6000,
      },
      cliConfigPath: "config.json",
      readFile: fileReader({
        "config.json": JSON.stringify({
          enabledToolsets: ["watchlists"],
          requestTimeoutMs: 4000,
          logLevel: "debug",
        }),
      }),
      configSchema,
    });

    expect(result.configPath).toBe("config.json");
    expect(result.settings).toEqual({
      enabledToolsets: ["identity"],
      enabledTools: ["getMe"],
      includeDeprecated: true,
      allowRealMoney: false,
      requestTimeoutMs: 6000,
      maxResponseBytes: 25 * 1024 * 1024,
      logLevel: "debug",
    });
  });

  it("gives an explicit CLI config path precedence over ETORO_CONFIG", async () => {
    const result = await loadConfiguration({
      env: { ETORO_CONFIG: "environment.json" },
      cli: {},
      cliConfigPath: "cli.json",
      readFile: fileReader({
        "environment.json": JSON.stringify({ enabledToolsets: ["balances"] }),
        "cli.json": JSON.stringify({ enabledToolsets: ["clubs"] }),
      }),
      configSchema,
    });
    expect(result.configPath).toBe("cli.json");
    expect(result.settings.enabledToolsets).toEqual(["clubs"]);
  });

  it("rejects unknown properties and out-of-range values through the schema", async () => {
    await expect(
      loadConfiguration({
        env: {},
        cli: {},
        cliConfigPath: "invalid.json",
        readFile: fileReader({
          "invalid.json": JSON.stringify({ requestTimeoutMs: 1, apiKey: "forbidden" }),
        }),
        configSchema,
      }),
    ).rejects.toThrow(/schema validation/u);
  });

  it("rejects removed disable settings in configuration files actionably", async () => {
    await expect(
      loadConfiguration({
        env: {},
        cli: {},
        cliConfigPath: "removed.json",
        readFile: fileReader({
          "removed.json": JSON.stringify({
            enabledToolsets: ["watchlists"],
            disabledTools: ["getRates"],
          }),
        }),
        configSchema,
      }),
    ).rejects.toThrow(/schema validation.*disabledTools|disabledTools.*schema validation/u);
  });

  it("reports malformed JSON and non-object configuration files actionably", async () => {
    await expect(
      loadConfiguration({
        env: {},
        cli: {},
        cliConfigPath: "broken.json",
        readFile: fileReader({ "broken.json": "{" }),
        configSchema,
      }),
    ).rejects.toThrow(/not valid JSON/u);
    await expect(
      loadConfiguration({
        env: {},
        cli: {},
        cliConfigPath: "array.json",
        readFile: fileReader({ "array.json": "[]" }),
        configSchema,
      }),
    ).rejects.toThrow(/must contain a JSON object/u);
  });
});

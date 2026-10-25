import { describe, expect, it } from "vitest";
import { parseCliArguments } from "../../src/config/cli-arguments.js";

describe("CLI argument parsing", () => {
  it("defaults to the server command", () => {
    expect(parseCliArguments([])).toMatchObject({
      command: "server",
      settings: {},
      configPath: null,
      all: false,
      json: false,
    });
  });

  it("parses inspection commands and output flags", () => {
    expect(parseCliArguments(["tools", "list", "--all", "--json"])).toMatchObject({
      command: "tools-list",
      all: true,
      json: true,
    });
    expect(parseCliArguments(["config", "validate", "--json"])).toMatchObject({
      command: "config-validate",
      json: true,
    });
  });

  it("accumulates repeated tool and toolset flags", () => {
    const invocation = parseCliArguments([
      "--enable-toolset",
      "watchlists",
      "--enable-toolset",
      "identity",
      "--disable-tool",
      "getRates",
    ]);
    expect(invocation.settings.enabledToolsets).toEqual(["watchlists", "identity"]);
    expect(invocation.settings.disabledTools).toEqual(["getRates"]);
  });

  it("lets the last safety-flag spelling win and validates numeric ranges", () => {
    const invocation = parseCliArguments([
      "--include-deprecated",
      "--no-include-deprecated",
      "--allow-real-money",
      "--timeout-ms",
      "5000",
      "--log-level",
      "debug",
    ]);
    expect(invocation.settings).toMatchObject({
      includeDeprecated: false,
      allowRealMoney: true,
      requestTimeoutMs: 5000,
      logLevel: "debug",
    });
    expect(() => parseCliArguments(["--timeout-ms", "10"])).toThrow(/requestTimeoutMs/u);
  });

  it("rejects unknown commands, unknown options, missing values, and misplaced flags", () => {
    expect(() => parseCliArguments(["tools", "inspect"])).toThrow(/Unknown command/u);
    expect(() => parseCliArguments(["--unknown"])).toThrow(/Unknown option/u);
    expect(() => parseCliArguments(["--enable-toolset"])).toThrow(/requires a value/u);
    expect(() => parseCliArguments(["--all", "config", "validate"])).toThrow(
      /--all is only valid/u,
    );
  });

  it("gives help precedence over version", () => {
    expect(parseCliArguments(["--version", "--help"]).command).toBe("help");
    expect(parseCliArguments(["--version"]).command).toBe("version");
  });
});

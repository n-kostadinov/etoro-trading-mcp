import { describe, expect, it } from "vitest";
import { parseEnvironmentSettings } from "../../src/config/environment.js";
import { defaultRuntimeSettings } from "../../src/config/configuration.js";

describe("environment configuration", () => {
  it("parses comma-separated lists and preserves an explicit empty list", () => {
    const settings = parseEnvironmentSettings({
      ETORO_ENABLED_TOOLSETS: "watchlists, identity",
      ETORO_ENABLED_TOOLS: "",
    });
    expect(settings.enabledToolsets).toEqual(["watchlists", "identity"]);
    expect(settings.enabledTools).toEqual([]);
  });

  it("rejects removed disable variables with migration guidance", () => {
    expect(() => parseEnvironmentSettings({ ETORO_DISABLED_TOOLSETS: "trading-demo" })).toThrow(
      /ETORO_DISABLED_TOOLSETS.*ETORO_ENABLED_TOOLSETS/u,
    );
    expect(() => parseEnvironmentSettings({ ETORO_DISABLED_TOOLS: "getRates" })).toThrow(
      /ETORO_DISABLED_TOOLS.*ETORO_ENABLED_TOOLS/u,
    );
  });

  it("rejects malformed list values", () => {
    expect(() => parseEnvironmentSettings({ ETORO_ENABLED_TOOLS: "getRates,,getMe" })).toThrow(
      /empty item/u,
    );
  });

  it("accepts only strict boolean spellings", () => {
    expect(
      parseEnvironmentSettings({
        ETORO_INCLUDE_DEPRECATED: "TRUE",
        ETORO_ALLOW_REAL_MONEY: "false",
      }),
    ).toEqual({ includeDeprecated: true, allowRealMoney: false });
    expect(() => parseEnvironmentSettings({ ETORO_INCLUDE_DEPRECATED: "yes" })).toThrow(
      /ETORO_INCLUDE_DEPRECATED/u,
    );
  });

  it("parses bounded integers and rejects invalid values", () => {
    expect(parseEnvironmentSettings({ ETORO_TIMEOUT_MS: "4500" })).toEqual({
      requestTimeoutMs: 4500,
    });
    expect(() => parseEnvironmentSettings({ ETORO_TIMEOUT_MS: "soon" })).toThrow(
      /ETORO_TIMEOUT_MS/u,
    );
    expect(() =>
      parseEnvironmentSettings({ ETORO_MAX_RESPONSE_BYTES: `${Number.MAX_SAFE_INTEGER}0` }),
    ).toThrow(/integer/u);
  });

  it("rejects unsupported log levels", () => {
    expect(() => parseEnvironmentSettings({ ETORO_LOG_LEVEL: "verbose" })).toThrow(
      /ETORO_LOG_LEVEL/u,
    );
  });

  it("uses safe defaults when no selection variables are set", () => {
    expect(defaultRuntimeSettings).toEqual({
      enabledToolsets: [],
      enabledTools: [],
      includeDeprecated: false,
      allowRealMoney: false,
      requestTimeoutMs: 30_000,
      maxResponseBytes: 25 * 1024 * 1024,
      logLevel: "info",
    });
  });
});

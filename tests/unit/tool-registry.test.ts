import { describe, expect, it } from "vitest";
import catalog from "../../src/generated/tool-catalog.js";
import { defaultRuntimeSettings } from "../../src/config/configuration.js";
import type { RuntimeSettings } from "../../src/config/types.js";
import { resolveToolRegistry } from "../../src/registry/tool-registry.js";

function settings(overrides: Partial<RuntimeSettings>): RuntimeSettings {
  return { ...defaultRuntimeSettings, ...overrides };
}

function status(registry: ReturnType<typeof resolveToolRegistry>, operationId: string) {
  const found = registry.statuses.find((candidate) => candidate.operationId === operationId);
  if (found === undefined) {
    throw new Error(`Missing status for ${operationId}`);
  }
  return found;
}

describe("tool registry selection and safety policy", () => {
  it("enables exactly the documented market-data and current demo defaults", () => {
    const registry = resolveToolRegistry(catalog, defaultRuntimeSettings);
    expect(registry.enabledOperations).toHaveLength(28);
    expect(registry.enabledOperations.every((tool) => tool.defaultEnabled)).toBe(true);
    expect(registry.warnings).toHaveLength(6);
    expect(registry.warnings.every((warning) => warning.includes("blocked (deprecated)"))).toBe(
      true,
    );
    expect(status(registry, "getRates").enabled).toBe(true);
    expect(status(registry, "getMe").enabled).toBe(false);
    expect(
      status(registry, "createTradingExecutionDemoMarketOpenOrdersByAmount").blockedBy,
    ).toEqual(["deprecated"]);
  });

  it("adds toolsets to the defaults and supports explicit default removal", () => {
    const registry = resolveToolRegistry(
      catalog,
      settings({ enabledToolsets: ["watchlists"], disabledToolsets: ["trading-demo"] }),
    );
    expect(registry.enabledToolsets).toEqual(["market-data", "watchlists"]);
    expect(registry.enabledOperations).toHaveLength(29);
  });

  it("lets an individual tool override a disabled toolset while disable-tool wins overall", () => {
    const enabledDespiteToolset = resolveToolRegistry(
      catalog,
      settings({ disabledToolsets: ["market-data"], enabledTools: ["getRates"] }),
    );
    expect(enabledDespiteToolset.warnings).toHaveLength(6);
    expect(enabledDespiteToolset.enabledOperations).toHaveLength(18);
    expect(status(enabledDespiteToolset, "getRates").enabled).toBe(true);

    const disabledWins = resolveToolRegistry(
      catalog,
      settings({
        disabledToolsets: ["market-data"],
        enabledTools: ["getRates"],
        disabledTools: ["getRates"],
      }),
    );
    expect(status(disabledWins, "getRates").enabled).toBe(false);
    expect(disabledWins.warnings).toContainEqual(
      "getRates is both enabled and disabled; disable wins",
    );
  });

  it("keeps legacy and real-money safety gates above individual enable rules", () => {
    const legacyBlocked = resolveToolRegistry(
      catalog,
      settings({ enabledTools: ["postFeedsPost"] }),
    );
    expect(status(legacyBlocked, "postFeedsPost").enabled).toBe(false);
    expect(status(legacyBlocked, "postFeedsPost").blockedBy).toEqual(["deprecated"]);

    const legacyEnabled = resolveToolRegistry(
      catalog,
      settings({ enabledTools: ["postFeedsPost"], includeDeprecated: true }),
    );
    expect(status(legacyEnabled, "postFeedsPost").enabled).toBe(true);

    const realMoneyBlocked = resolveToolRegistry(
      catalog,
      settings({ enabledToolsets: ["trading-real"], disabledToolsets: ["trading-demo"] }),
    );
    expect(status(realMoneyBlocked, "createTradingExecutionOrdersV3").blockedBy).toEqual([
      "real-money",
    ]);
    expect(status(realMoneyBlocked, "getTradingInfoRealPnl").enabled).toBe(true);

    const realMoneyEnabled = resolveToolRegistry(
      catalog,
      settings({
        enabledToolsets: ["trading-real"],
        disabledToolsets: ["trading-demo"],
        allowRealMoney: true,
      }),
    );
    expect(status(realMoneyEnabled, "createTradingExecutionOrdersV3").enabled).toBe(true);
  });

  it("fails actionably on unknown toolsets and tools", () => {
    expect(() => resolveToolRegistry(catalog, settings({ enabledToolsets: ["prices"] }))).toThrow(
      /Unknown toolset names: prices.*tools list --all/u,
    );
    expect(() => resolveToolRegistry(catalog, settings({ enabledTools: ["readPrices"] }))).toThrow(
      /Unknown tool names: readPrices.*tools list --all/u,
    );
  });

  it("warns when configuration produces no enabled tools", () => {
    const registry = resolveToolRegistry(
      catalog,
      settings({ disabledToolsets: ["market-data", "trading-demo"] }),
    );
    expect(registry.enabledOperations).toHaveLength(0);
    expect(registry.warnings).toContainEqual(
      "No tools are enabled; the MCP server will expose an empty tool list",
    );
  });
});

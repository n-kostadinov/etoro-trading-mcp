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
  it("enables nothing by default and warns about the empty tool list", () => {
    const registry = resolveToolRegistry(catalog, defaultRuntimeSettings);
    expect(registry.enabledToolsets).toEqual([]);
    expect(registry.enabledOperations).toHaveLength(0);
    expect(registry.warnings).toContainEqual(
      "No tools are enabled; the MCP server will expose an empty tool list",
    );
  });

  it("enables every current tool of a listed toolset", () => {
    const registry = resolveToolRegistry(catalog, settings({ enabledToolsets: ["watchlists"] }));
    expect(registry.enabledToolsets).toEqual(["watchlists"]);
    expect(registry.enabledOperations).toHaveLength(18);
    expect(registry.enabledOperations.every((tool) => tool.toolsetId === "watchlists")).toBe(true);
  });

  it("enables the documented example set with legacy demo tools blocked", () => {
    const registry = resolveToolRegistry(
      catalog,
      settings({ enabledToolsets: ["market-data", "trading-demo"] }),
    );
    expect(registry.enabledOperations).toHaveLength(28);
    expect(registry.warnings).toHaveLength(6);
    expect(registry.warnings.every((warning) => warning.includes("blocked (deprecated)"))).toBe(
      true,
    );
    expect(status(registry, "getRates").enabled).toBe(true);
    expect(
      status(registry, "createTradingExecutionDemoMarketOpenOrdersByAmount").blockedBy,
    ).toEqual(["deprecated"]);
  });

  it("adds individually enabled tools on top of toolset selection", () => {
    const alone = resolveToolRegistry(catalog, settings({ enabledTools: ["getRates"] }));
    expect(alone.enabledOperations.map((tool) => tool.operationId)).toEqual(["getRates"]);

    const combined = resolveToolRegistry(
      catalog,
      settings({ enabledToolsets: ["watchlists"], enabledTools: ["getRates"] }),
    );
    expect(combined.enabledOperations).toHaveLength(19);
  });

  it("keeps legacy and real-money safety gates above selection rules", () => {
    const legacyBlocked = resolveToolRegistry(
      catalog,
      settings({ enabledTools: ["postFeedsPost"] }),
    );
    expect(status(legacyBlocked, "postFeedsPost").enabled).toBe(false);
    expect(status(legacyBlocked, "postFeedsPost").blockedBy).toEqual(["deprecated"]);
    expect(legacyBlocked.warnings).toContainEqual(
      "No tools are enabled; the MCP server will expose an empty tool list",
    );

    const legacyEnabled = resolveToolRegistry(
      catalog,
      settings({ enabledTools: ["postFeedsPost"], includeDeprecated: true }),
    );
    expect(status(legacyEnabled, "postFeedsPost").enabled).toBe(true);

    const realMoneyBlocked = resolveToolRegistry(
      catalog,
      settings({ enabledToolsets: ["trading-real"] }),
    );
    expect(status(realMoneyBlocked, "createTradingExecutionOrdersV3").blockedBy).toEqual([
      "real-money",
    ]);
    expect(status(realMoneyBlocked, "getTradingInfoRealPnl").enabled).toBe(true);

    const realMoneyEnabled = resolveToolRegistry(
      catalog,
      settings({ enabledToolsets: ["trading-real"], allowRealMoney: true }),
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
});

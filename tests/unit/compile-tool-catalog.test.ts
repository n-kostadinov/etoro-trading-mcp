import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { compileToolCatalog } from "../../src/catalog/compile-tool-catalog.js";
import manifest from "../../src/generated/openapi-manifest.js";
import { asOpenApiDocument } from "../../src/openapi/model.js";

const policy = JSON.parse(
  await readFile(new URL("../../openapi/policy-overrides.json", import.meta.url), "utf8"),
) as unknown;
const coreDocument = asOpenApiDocument(
  JSON.parse(
    await readFile(new URL("../../openapi/etoro.core.json", import.meta.url), "utf8"),
  ) as unknown,
  "core",
);
const deprecatedDocument = asOpenApiDocument(
  JSON.parse(
    await readFile(new URL("../../openapi/etoro.deprecated.json", import.meta.url), "utf8"),
  ) as unknown,
  "deprecated",
);

function compileWithPolicy(modifiedPolicy: unknown) {
  return compileToolCatalog({
    manifest,
    coreDocument,
    deprecatedDocument,
    policy: modifiedPolicy,
  });
}

describe("catalog policy validation", () => {
  it("rejects stale or incomplete toolset mappings", () => {
    const stale = structuredClone(policy) as { toolsets: Record<string, string> };
    stale.toolsets.OldTag = "old-tag";
    expect(() => compileWithPolicy(stale)).toThrow(/Toolset mapping mismatch.*stale=OldTag/u);
    const missing = structuredClone(policy) as { toolsets: Record<string, string> };
    delete missing.toolsets.Watchlists;
    expect(() => compileWithPolicy(missing)).toThrow(
      /Toolset mapping mismatch.*missing=Watchlists/u,
    );
  });

  it("rejects overrides that reference unknown operations", () => {
    const stale = structuredClone(policy) as { readOnlyOperations: string[] };
    stale.readOnlyOperations.push("notAnOperation");
    expect(() => compileWithPolicy(stale)).toThrow(/readOnlyOperations references unknown/u);
  });

  it("rejects replacement metadata for a current operation", () => {
    const stale = structuredClone(policy) as { replacements: Record<string, string> };
    stale.replacements.getRates = "getMarketDataSearch";
    expect(() => compileWithPolicy(stale)).toThrow(/not legacy/u);
  });

  it("rejects an operation classified as both read-only and real-money", () => {
    const stale = structuredClone(policy) as { realMoneyMutationOperations: string[] };
    stale.realMoneyMutationOperations.push("getRates");
    expect(() => compileWithPolicy(stale)).toThrow(/both read-only and real-money/u);
  });

  it("reports publication-surface inconsistencies without changing coverage", () => {
    const coreWithoutWatchlists = structuredClone(coreDocument);
    expect(coreWithoutWatchlists.paths["/api/v1/watchlists"]).toBeDefined();
    delete coreWithoutWatchlists.paths["/api/v1/watchlists"];
    const catalog = compileToolCatalog({
      manifest,
      coreDocument: coreWithoutWatchlists,
      deprecatedDocument,
      policy,
    });
    expect(catalog.warnings).toHaveLength(1);
    expect(catalog.warnings[0]).toMatch(
      /Swagger UI operations absent from both portal documents:.*getWatchlists/u,
    );
    expect(catalog.operations).toHaveLength(156);
  });
});

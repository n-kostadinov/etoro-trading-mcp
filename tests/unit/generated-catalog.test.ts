import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import catalog from "../../src/generated/tool-catalog.js";
import manifest from "../../src/generated/openapi-manifest.js";
import { HTTP_METHODS } from "../../src/openapi/model.js";

const sourceDocument = JSON.parse(
  await readFile(new URL("../../openapi/etoro.swagger.json", import.meta.url), "utf8"),
) as { paths: Record<string, Record<string, unknown>> };

function sourceIdentities(): string[] {
  const identities: string[] = [];
  for (const [path, pathItem] of Object.entries(sourceDocument.paths)) {
    for (const method of HTTP_METHODS) {
      if (pathItem[method] !== undefined) {
        identities.push(`${method.toUpperCase()} ${path}`);
      }
    }
  }
  return identities.sort();
}

describe("generated OpenAPI and tool catalogs", () => {
  it("has exact operation identity coverage of the canonical Swagger document", () => {
    const generated = manifest.operations
      .map((operation) => `${operation.method} ${operation.path}`)
      .sort();
    const source = sourceIdentities();
    expect(generated).toEqual(source);
    expect(new Set(manifest.operations.map((operation) => operation.operationId)).size).toBe(197);
    expect(Math.max(...manifest.operations.map((operation) => operation.operationId.length))).toBe(
      87,
    );
  });

  it("preserves the complete toolset and safety baseline", () => {
    expect(catalog.toolsets).toHaveLength(27);
    expect(catalog.operations).toHaveLength(197);
    expect(catalog.operations.filter((operation) => operation.deprecated)).toHaveLength(19);
    expect(catalog.operations.filter((operation) => operation.sourceDeprecated)).toHaveLength(7);
    expect(catalog.defaultToolsets).toEqual(["market-data", "trading-demo"]);
    expect(catalog.defaultToolCount).toBe(28);
    expect(catalog.warnings).toEqual([]);
    const count = (toolset: string) =>
      catalog.operations.filter((operation) => operation.toolsetId === toolset).length;
    expect(count("market-data")).toBe(11);
    expect(count("trading-demo")).toBe(23);
    expect(
      catalog.operations.filter(
        (operation) => operation.toolsetId === "trading-demo" && !operation.deprecated,
      ),
    ).toHaveLength(17);
  });

  it("classifies reviewed read-only and real-money operations", () => {
    const aggregate = catalog.operations.find(
      (operation) => operation.operationId === "postAggregatedPortfolio",
    );
    const transfer = catalog.operations.find(
      (operation) => operation.operationId === "postMoneyTransfer",
    );
    const subAccountTransfer = catalog.operations.find(
      (operation) => operation.operationId === "createSubAccountMoneyTransfer",
    );
    expect(aggregate?.readOnly).toBe(true);
    expect(aggregate?.realMoneyMutation).toBe(false);
    expect(transfer?.realMoneyMutation).toBe(true);
    expect(subAccountTransfer?.realMoneyMutation).toBe(true);
    expect(transfer?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });

  it("records verified replacements only for legacy operations", () => {
    const withReplacements = catalog.operations.filter(
      (operation) => operation.replacementOperationId !== null,
    );
    expect(withReplacements).toHaveLength(7);
    expect(withReplacements.every((operation) => operation.deprecated)).toBe(true);
    expect(
      withReplacements.every(
        (operation) =>
          operation.replacementOperationId !== null &&
          catalog.operations.some(
            (candidate) => candidate.operationId === operation.replacementOperationId,
          ),
      ),
    ).toBe(true);
  });

  it("keeps credential headers out of every generated input schema", () => {
    for (const operation of catalog.operations) {
      expect(operation.inputSchema.type).toBe("object");
      const properties = operation.inputSchema.properties as Record<string, unknown> | undefined;
      const headers = properties?.headers as
        | { required?: string[]; properties?: Record<string, unknown> }
        | undefined;
      expect(Object.keys(headers?.properties ?? {})).not.toContain("Authorization");
      expect(headers?.required ?? []).not.toContain("x-request-id");
      for (const forbidden of ["authorization", "x-api-key", "x-user-key"]) {
        expect(Object.keys(headers?.properties ?? {}).map(String)).not.toContain(forbidden);
      }
      expect(operation.annotations.openWorldHint).toBe(true);
      expect(operation.descriptionForTool).toContain(`${operation.method} ${operation.path}`);
    }
  });

  it("preserves request media types and the single binary upload", () => {
    expect(
      manifest.operations.filter(
        (operation) => operation.requestBody?.mediaType === "application/json",
      ),
    ).toHaveLength(60);
    expect(
      manifest.operations.filter(
        (operation) => operation.requestBody?.mediaType === "multipart/form-data",
      ),
    ).toHaveLength(1);
    const attachment = catalog.operations.find(
      (operation) => operation.operationId === "postAttachments",
    );
    expect(attachment?.requestBody?.hasBinary).toBe(true);
  });
});

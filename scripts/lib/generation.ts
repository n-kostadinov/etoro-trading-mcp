import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import openapiTS, { astToString, COMMENT_HEADER } from "openapi-typescript";
import type { OpenAPI3 } from "openapi-typescript";
import { compileToolCatalog } from "../../src/catalog/compile-tool-catalog.js";
import type { ToolCatalog } from "../../src/catalog/types.js";
import { compileOpenApiDocument } from "../../src/generator/compile-openapi.js";
import type { OpenApiManifest } from "../../src/generator/manifest-types.js";
import { asOpenApiDocument } from "../../src/openapi/model.js";

export const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

export async function readJsonFile(relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(repositoryRoot, relativePath), "utf8")) as unknown;
}

function manifestModule(manifest: OpenApiManifest): string {
  return `/* This file is generated. Run npm run generate instead of editing it. */\nimport type { OpenApiManifest } from "../generator/manifest-types.js";\n\nconst manifest = ${JSON.stringify(manifest, null, 2)} as unknown as OpenApiManifest;\n\nexport default manifest;\n`;
}

function catalogModule(catalog: ToolCatalog): string {
  return `/* This file is generated. Run npm run generate instead of editing it. */\nimport type { ToolCatalog } from "../catalog/types.js";\n\nconst catalog = ${JSON.stringify(catalog, null, 2)} as unknown as ToolCatalog;\n\nexport default catalog;\n`;
}

function markdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function scopeAlternatives(operation: ToolCatalog["operations"][number]): string {
  if (operation.oauthScopeAlternatives.length === 0) {
    return "key pair only in the source document";
  }
  return operation.oauthScopeAlternatives
    .map((scopes) => (scopes.length === 0 ? "(unscoped OAuth)" : scopes.join(" + ")))
    .join("<br>OR ");
}

function rateLimit(operation: ToolCatalog["operations"][number]): string {
  const pool = operation.rateLimit.defaultPool
    ? ", default shared pool"
    : operation.rateLimit.shared
      ? ", shared pool"
      : "";
  return `${operation.rateLimit.limit}/${operation.rateLimit.window}s${pool}`;
}

function toolsDocument(catalog: ToolCatalog): string {
  const rows = catalog.operations
    .map(
      (operation) =>
        `| \`${markdownCell(operation.operationId)}\` | ${markdownCell(operation.toolsetId)} | \`${markdownCell(operation.method)} ${markdownCell(operation.path)}\` | ${yesNo(operation.deprecated)} | ${yesNo(operation.readOnly)} | ${yesNo(operation.realMoneyMutation)} | ${markdownCell(rateLimit(operation))} | ${markdownCell(scopeAlternatives(operation))} | ${operation.replacementOperationId === null ? "---" : `\`${markdownCell(operation.replacementOperationId)}\``} |`,
    )
    .join("\n");
  return `# Tool reference\n\nThis file is generated from eToro Swagger UI **${catalog.sourceVersion}** (canonical SHA-256 \`${catalog.sourceCanonicalSha256}\`). Do not edit it directly; run \`npm run generate\`.\n\nThe catalog contains **${catalog.operations.length} tools** in **${catalog.toolsets.length} toolsets**. All toolsets are disabled by default; enable toolsets or individual tools through configuration. See the README quick look for a sample configuration.\n\n- OAuth scopes listed in one alternative are alternatives to the key-pair authentication method; separate rows separated by OR are alternatives to each other. See [trading.md](trading.md).\n- Real-money mutations require the separate \`allowRealMoney\` opt-in in addition to tool selection.\n- Legacy tools require \`includeDeprecated\`.\n\n| Tool | Toolset | REST request | Legacy | Read-only | Real-money mutation | Rate limit | OAuth scope alternatives | Replacement |\n|---|---|---|---|---|---|---|---|---|\n${rows}\n`;
}

function toolsetsDocument(catalog: ToolCatalog): string {
  const rows = catalog.toolsets
    .map(
      (toolset) =>
        `| \`${markdownCell(toolset.id)}\` | ${markdownCell(toolset.sourceTag)} | ${toolset.currentOperations} | ${toolset.legacyOperations} | ${toolset.currentOperations + toolset.legacyOperations} |`,
    )
    .join("\n");
  const ids = catalog.toolsets.map((toolset) => `- \`${toolset.id}\``).join("\n");
  return `# Toolsets\n\nThis file is generated from eToro Swagger UI **${catalog.sourceVersion}**. Do not edit it directly; run \`npm run generate\`.\n\nAll toolsets are disabled by default. Enable them through \`enabledToolsets\` / \`ETORO_ENABLED_TOOLSETS\`; enabling a toolset enables all of its tools. See the README quick look for a sample configuration and [configuration.md](configuration.md) for precedence and safety gates.\n\n| Toolset ID | Swagger tag | Current tools | Legacy tools | Total |\n|---|---|---:|---:|---:|\n${rows}\n\n## Available IDs\n\n${ids}\n`;
}

async function apiTypes(document: unknown): Promise<string> {
  const nodes = await openapiTS(document as OpenAPI3);
  return `${COMMENT_HEADER}${astToString(nodes)}`.replaceAll("\r\n", "\n");
}

export async function generateArtifactsFromDisk(): Promise<Map<string, string>> {
  const swagger = asOpenApiDocument(await readJsonFile("openapi/etoro.swagger.json"), "swagger");
  const sourceManifest = (await readJsonFile("openapi/source-manifest.json")) as {
    sources: { swagger: { canonicalSha256: string } };
  };
  const manifest = compileOpenApiDocument(swagger, {
    sourceCanonicalSha256: sourceManifest.sources.swagger.canonicalSha256,
  });
  const catalog = compileToolCatalog({
    manifest,
    coreDocument: asOpenApiDocument(await readJsonFile("openapi/etoro.core.json"), "core"),
    deprecatedDocument: asOpenApiDocument(
      await readJsonFile("openapi/etoro.deprecated.json"),
      "deprecated",
    ),
    policy: await readJsonFile("openapi/policy-overrides.json"),
  });
  return new Map([
    ["src/generated/openapi-manifest.ts", manifestModule(manifest)],
    ["src/generated/tool-catalog.ts", catalogModule(catalog)],
    ["src/generated/etoro-api.d.ts", await apiTypes(swagger)],
    ["docs/data/openapi-operations.json", `${JSON.stringify(manifest, null, 2)}\n`],
    ["docs/data/tool-catalog.json", `${JSON.stringify(catalog, null, 2)}\n`],
    ["docs/tools.md", toolsDocument(catalog)],
    ["docs/toolsets.md", toolsetsDocument(catalog)],
  ]);
}

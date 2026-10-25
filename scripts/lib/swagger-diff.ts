import {
  canonicalJson,
  getOperationEntries,
  isRecord,
  sha256,
  type HttpMethod,
  type OpenApiDocument,
} from "../../src/openapi/model.js";

export interface SwaggerDiffInput {
  oldSwagger: OpenApiDocument;
  newSwagger: OpenApiDocument;
  oldCore: OpenApiDocument;
  newCore: OpenApiDocument;
  oldDeprecated: OpenApiDocument;
  newDeprecated: OpenApiDocument;
}

interface SourceOperation {
  method: Uppercase<HttpMethod>;
  path: string;
  operationId: string;
  deprecated: boolean;
  tags: string[];
  signature: string;
}

function markdownCode(value: string): string {
  const tick = String.fromCharCode(96);
  return `${tick}${value}${tick}`;
}

function operationMap(document: OpenApiDocument): Map<string, SourceOperation> {
  return new Map(
    getOperationEntries(document).map((entry) => [
      `${entry.method.toUpperCase()} ${entry.path}`,
      {
        method: entry.method.toUpperCase() as Uppercase<HttpMethod>,
        path: entry.path,
        operationId: entry.operationId,
        deprecated: entry.deprecated,
        tags: entry.tags,
        signature: canonicalJson(entry.operation),
      },
    ]),
  );
}

function schemaMap(document: OpenApiDocument): Map<string, string> {
  const components = document.components;
  const schemas = isRecord(components) && isRecord(components.schemas) ? components.schemas : {};
  return new Map(Object.entries(schemas).map(([name, schema]) => [name, canonicalJson(schema)]));
}

function operationIds(document: OpenApiDocument): Set<string> {
  return new Set(getOperationEntries(document).map((entry) => entry.operationId));
}

function changedOperationFields(
  old: SourceOperation,
  updated: SourceOperation,
  oldDocument: OpenApiDocument,
  newDocument: OpenApiDocument,
): string[] {
  const fields: string[] = [];
  if (old.operationId !== updated.operationId) {
    fields.push(
      `operationId: ${markdownCode(old.operationId)} -> ${markdownCode(updated.operationId)}`,
    );
  }
  if (old.tags.join(",") !== updated.tags.join(",")) {
    fields.push(`tags: ${old.tags.join(", ")} → ${updated.tags.join(", ")}`);
  }
  if (old.deprecated !== updated.deprecated) {
    fields.push(`deprecated: ${old.deprecated} → ${updated.deprecated}`);
  }
  if (old.signature === updated.signature) {
    return fields;
  }
  const operationField = (
    document: OpenApiDocument,
    operation: SourceOperation,
    field: string,
  ): unknown => {
    const pathItem = document.paths[operation.path];
    const candidate = pathItem?.[operation.method.toLowerCase()];
    return isRecord(candidate) ? candidate[field] : undefined;
  };
  for (const field of [
    "summary",
    "description",
    "parameters",
    "requestBody",
    "responses",
    "security",
    "x-ratelimit",
  ] as const) {
    if (
      canonicalJson(operationField(oldDocument, old, field)) !==
      canonicalJson(operationField(newDocument, updated, field))
    ) {
      fields.push(`changed ${field}`);
    }
  }
  return fields;
}

function publicationInconsistencies(input: SwaggerDiffInput): string[] {
  const warnings: string[] = [];
  const sourceIds = operationIds(input.newSwagger);
  const coreIds = operationIds(input.newCore);
  const deprecatedIds = operationIds(input.newDeprecated);
  const coreOnly = [...coreIds].filter((id) => !sourceIds.has(id)).sort();
  const deprecatedOnly = [...deprecatedIds].filter((id) => !sourceIds.has(id)).sort();
  const swaggerOnly = [...sourceIds]
    .filter((id) => !coreIds.has(id) && !deprecatedIds.has(id))
    .sort();
  if (coreOnly.length > 0) {
    warnings.push(`Core-only operations: ${coreOnly.join(", ")}`);
  }
  if (deprecatedOnly.length > 0) {
    warnings.push(`Deprecated-portal-only operations: ${deprecatedOnly.join(", ")}`);
  }
  if (swaggerOnly.length > 0) {
    warnings.push(
      `Swagger UI operations absent from both portal documents: ${swaggerOnly.join(", ")}`,
    );
  }
  return warnings;
}

function defaultImpact(old: SourceOperation, updated: SourceOperation): string {
  const defaultTags = new Set(["Market Data", "Trading - Demo"]);
  const oldDefault = old.tags.some((tag) => defaultTags.has(tag)) && !old.deprecated;
  const updatedDefault = updated.tags.some((tag) => defaultTags.has(tag)) && !updated.deprecated;
  if (oldDefault && !updatedDefault) {
    return "removes a default-enabled tool";
  }
  if (!oldDefault && updatedDefault) {
    return "adds a default-enabled tool";
  }
  if (updatedDefault) {
    return "changes a default-enabled tool";
  }
  return "does not affect default-enabled tools";
}

export function createSwaggerDiffReport(input: SwaggerDiffInput): string {
  const oldOperations = operationMap(input.oldSwagger);
  const newOperations = operationMap(input.newSwagger);
  const added = [...newOperations.entries()]
    .filter(([identity]) => !oldOperations.has(identity))
    .map(([identity, operation]) => ({ identity, operation }))
    .sort((left, right) => left.identity.localeCompare(right.identity));
  const removed = [...oldOperations.entries()]
    .filter(([identity]) => !newOperations.has(identity))
    .map(([identity, operation]) => ({ identity, operation }))
    .sort((left, right) => left.identity.localeCompare(right.identity));
  const changed = [...newOperations.entries()]
    .flatMap(([identity, updated]) => {
      const previous = oldOperations.get(identity);
      if (previous === undefined || previous.signature === updated.signature) {
        return [];
      }
      return [
        {
          identity,
          previous,
          updated,
          fields: changedOperationFields(previous, updated, input.oldSwagger, input.newSwagger),
        },
      ];
    })
    .sort((left, right) => left.identity.localeCompare(right.identity));
  const oldSchemas = schemaMap(input.oldSwagger);
  const newSchemas = schemaMap(input.newSwagger);
  const schemaChanges = [
    ...new Set([
      ...[...newSchemas.entries()]
        .filter(([name, signature]) => oldSchemas.get(name) !== signature)
        .map(([name]) => name),
      ...[...oldSchemas.keys()].filter((name) => !newSchemas.has(name)),
    ]),
  ].sort();

  const recommendation =
    removed.length > 0 ||
    changed.some((change) => change.previous.operationId !== change.updated.operationId)
      ? "major (breaking operation removal/rename; maintainer confirms)"
      : added.length > 0
        ? "minor (backward-compatible tools added; maintainer confirms)"
        : changed.length > 0 || schemaChanges.length > 0
          ? "manual review (schema/description changes may be patch, minor, or major)"
          : "none";

  const lines = [
    "# eToro Swagger semantic diff",
    "",
    `- Old Swagger version: ${markdownCode(input.oldSwagger.info.version)} (canonical SHA-256 ${markdownCode(sha256(canonicalJson(input.oldSwagger)))})`,
    `- New Swagger version: ${markdownCode(input.newSwagger.info.version)} (canonical SHA-256 ${markdownCode(sha256(canonicalJson(input.newSwagger)))})`,
    `- Added operations: **${added.length}**`,
    `- Removed operations: **${removed.length}**`,
    `- Changed operations: **${changed.length}**`,
    `- Changed component schemas: **${schemaChanges.length}**`,
    `- Suggested package SemVer impact: **${recommendation}**`,
    "",
  ];
  if (added.length > 0) {
    lines.push("## Added operations", "");
    for (const item of added) {
      lines.push(`- ${markdownCode(item.identity)} -> ${item.operation.operationId}`);
    }
    lines.push("");
  }
  if (removed.length > 0) {
    lines.push("## Removed operations", "");
    for (const item of removed) {
      lines.push(
        `- ${markdownCode(item.identity)} (was ${markdownCode(item.operation.operationId)})`,
      );
    }
    lines.push("");
  }
  if (changed.length > 0) {
    lines.push("## Changed operations", "");
    for (const change of changed) {
      lines.push(
        `- ${markdownCode(change.identity)}: ${change.fields.join("; ")}; ${defaultImpact(change.previous, change.updated)}`,
      );
    }
    lines.push("");
  }
  if (schemaChanges.length > 0) {
    lines.push(
      "## Changed component schemas",
      "",
      ...schemaChanges.map((name) => `- ${markdownCode(name)}`),
      "",
    );
  }
  const warnings = publicationInconsistencies(input);
  lines.push("## Publication consistency", "");
  if (warnings.length === 0) {
    lines.push("Swagger UI, Core, and Deprecated operation sets are consistent.");
  } else {
    lines.push(...warnings.map((warning) => `- ${warning}`));
  }
  lines.push(
    "",
    "Generated artifacts, tests, documentation, and package checks were run before this pull request was opened. No merge, tag, or npm publication is automatic.",
  );
  return `${lines.join("\n")}\n`;
}

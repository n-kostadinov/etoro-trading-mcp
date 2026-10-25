import type { OpenApiManifest, OpenApiOperationDescriptor } from "../generator/manifest-types.js";
import { getOperationEntries, isRecord, type OpenApiDocument } from "../openapi/model.js";
import type {
  CatalogOperation,
  CatalogPolicyOverrides,
  ToolCatalog,
  ToolsetDescriptor,
} from "./types.js";

function stringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${name} must be an array of strings`);
  }
  if (new Set(value).size !== value.length) {
    throw new Error(`${name} must not contain duplicates`);
  }
  return value as string[];
}

function stringRecord(value: unknown, name: string): Record<string, string> {
  if (!isRecord(value) || Object.values(value).some((item) => typeof item !== "string")) {
    throw new Error(`${name} must be an object of strings`);
  }
  return value as Record<string, string>;
}

export function validatePolicyOverrides(value: unknown): CatalogPolicyOverrides {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error("Policy overrides must declare schemaVersion 1");
  }
  const policy: CatalogPolicyOverrides = {
    schemaVersion: 1,
    defaultToolsets: stringArray(value.defaultToolsets, "defaultToolsets"),
    toolsets: stringRecord(value.toolsets, "toolsets"),
    readOnlyOperations: stringArray(value.readOnlyOperations, "readOnlyOperations"),
    realMoneyMutationOperations: stringArray(
      value.realMoneyMutationOperations,
      "realMoneyMutationOperations",
    ),
    replacements: stringRecord(value.replacements, "replacements"),
  };
  const toolsetIds = Object.values(policy.toolsets);
  if (new Set(toolsetIds).size !== toolsetIds.length) {
    throw new Error("Toolset IDs must be unique");
  }
  for (const id of toolsetIds) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      throw new Error(`Invalid toolset ID ${id}`);
    }
  }
  for (const id of policy.defaultToolsets) {
    if (!toolsetIds.includes(id)) {
      throw new Error(`Default toolset ${id} is not mapped to a Swagger tag`);
    }
  }
  return policy;
}

function operationIds(document: OpenApiDocument): Set<string> {
  return new Set(getOperationEntries(document).map((entry) => entry.operationId));
}

function assertKnownOperations(operationIds: Set<string>, values: string[], name: string): void {
  const unknown = values.filter((value) => !operationIds.has(value));
  if (unknown.length > 0) {
    throw new Error(`${name} references unknown operations: ${unknown.join(", ")}`);
  }
}

function scopeAlternatives(operation: OpenApiOperationDescriptor): string[][] {
  const alternatives = new Map<string, string[]>();
  for (const requirement of operation.security) {
    if (Array.isArray(requirement.oauth2)) {
      alternatives.set(JSON.stringify(requirement.oauth2), requirement.oauth2);
    }
  }
  return [...alternatives.values()];
}

function toolDescription(
  operation: OpenApiOperationDescriptor,
  policy: Pick<
    CatalogOperation,
    "deprecated" | "replacementOperationId" | "readOnly" | "realMoneyMutation"
  >,
  scopes: string[][],
): string {
  const sections = [
    operation.summary,
    `${operation.method} ${operation.path}`,
    operation.description,
    `Toolset source tag: ${operation.tags.join(", ")}.`,
  ];
  if (policy.deprecated) {
    sections.push(
      `LEGACY operation.${policy.replacementOperationId === null ? "" : ` Prefer ${policy.replacementOperationId}.`} Enable legacy tools explicitly.`,
    );
  }
  if (policy.realMoneyMutation) {
    sections.push(
      "REAL-MONEY OPERATION. This can change real funds or positions. It requires the separate real-money opt-in and user confirmation by the MCP client.",
    );
  } else if (!policy.readOnly && operation.tags.some((tag) => tag.includes("Demo"))) {
    sections.push("Demo operation: changes virtual/demo state only; it is not a real-money trade.");
  }
  if (scopes.length > 0) {
    sections.push(
      `OAuth scope alternatives (any one listed alternative): ${scopes
        .map((scopes) => (scopes.length === 0 ? "unscoped OAuth alternative" : scopes.join(" + ")))
        .join(" OR ")}.`,
    );
  }
  sections.push(
    `Rate limit: ${operation.rateLimit.limit} requests per ${operation.rateLimit.window} seconds${operation.rateLimit.defaultPool ? " in the default shared pool" : operation.rateLimit.shared ? " in a shared pool" : ""}.`,
    "x-request-id is generated when omitted. Reuse the returned request ID when checking an ambiguous outcome; non-idempotent mutations are not automatically retried.",
  );
  return sections.filter((section) => section.length > 0).join("\n\n");
}

function sourceWarnings(
  sourceIds: Set<string>,
  coreIds: Set<string>,
  deprecatedIds: Set<string>,
): string[] {
  const warnings: string[] = [];
  const coreOnly = [...coreIds].filter((id) => !sourceIds.has(id));
  const deprecatedOnly = [...deprecatedIds].filter((id) => !sourceIds.has(id));
  const unclassified = [...sourceIds].filter((id) => !coreIds.has(id) && !deprecatedIds.has(id));
  if (coreOnly.length > 0) {
    warnings.push(`Core-only operations absent from Swagger UI: ${coreOnly.sort().join(", ")}`);
  }
  if (deprecatedOnly.length > 0) {
    warnings.push(
      `Deprecated-portal operations absent from Swagger UI: ${deprecatedOnly.sort().join(", ")}`,
    );
  }
  if (unclassified.length > 0) {
    warnings.push(
      `Swagger UI operations absent from both portal documents: ${unclassified.sort().join(", ")}`,
    );
  }
  return warnings;
}

export function compileToolCatalog(options: {
  manifest: OpenApiManifest;
  coreDocument: OpenApiDocument;
  deprecatedDocument: OpenApiDocument;
  policy: unknown;
}): ToolCatalog {
  const { manifest, coreDocument, deprecatedDocument } = options;
  const policy = validatePolicyOverrides(options.policy);
  const sourceIds = new Set(manifest.operations.map((operation) => operation.operationId));
  const coreIds = operationIds(coreDocument);
  const deprecatedIds = operationIds(deprecatedDocument);
  const sourceTags = new Set(manifest.operations.flatMap((operation) => operation.tags));
  const missingTagMappings = [...sourceTags].filter((tag) => policy.toolsets[tag] === undefined);
  const staleTagMappings = Object.keys(policy.toolsets).filter((tag) => !sourceTags.has(tag));
  if (missingTagMappings.length > 0 || staleTagMappings.length > 0) {
    throw new Error(
      `Toolset mapping mismatch; missing=${missingTagMappings.join(",")}; stale=${staleTagMappings.join(",")}`,
    );
  }
  assertKnownOperations(sourceIds, policy.readOnlyOperations, "readOnlyOperations");
  assertKnownOperations(
    sourceIds,
    policy.realMoneyMutationOperations,
    "realMoneyMutationOperations",
  );
  assertKnownOperations(sourceIds, Object.keys(policy.replacements), "replacements");
  assertKnownOperations(sourceIds, Object.values(policy.replacements), "replacement targets");

  const operations = manifest.operations.map<CatalogOperation>((operation) => {
    const sourceTag = operation.tags[0];
    if (sourceTag === undefined) {
      throw new Error(`${operation.operationId} has no source tag`);
    }
    const toolsetId = policy.toolsets[sourceTag];
    if (toolsetId === undefined) {
      throw new Error(`${operation.operationId} has no toolset mapping`);
    }
    const deprecated = operation.sourceDeprecated || deprecatedIds.has(operation.operationId);
    const replacementOperationId = policy.replacements[operation.operationId] ?? null;
    if (replacementOperationId !== null && !deprecated) {
      throw new Error(`Replacement override ${operation.operationId} is not legacy`);
    }
    const readOnly =
      operation.method === "GET" ||
      operation.method === "HEAD" ||
      operation.readOnlyExtension ||
      policy.readOnlyOperations.includes(operation.operationId);
    const realMoneyMutation =
      !readOnly &&
      (operation.realMoneyExtension ||
        policy.realMoneyMutationOperations.includes(operation.operationId));
    if (readOnly && policy.realMoneyMutationOperations.includes(operation.operationId)) {
      throw new Error(`${operation.operationId} is classified as both read-only and real-money`);
    }
    const scopes = scopeAlternatives(operation);
    const policyState = { deprecated, replacementOperationId, readOnly, realMoneyMutation };
    return {
      ...operation,
      toolsetId,
      deprecated,
      replacementOperationId,
      readOnly,
      realMoneyMutation,
      defaultEnabled:
        policy.defaultToolsets.includes(toolsetId) && !deprecated && !realMoneyMutation,
      oauthScopeAlternatives: scopes,
      descriptionForTool: toolDescription(operation, policyState, scopes),
      annotations: {
        title: operation.summary,
        readOnlyHint: readOnly,
        destructiveHint: !readOnly,
        idempotentHint: readOnly,
        openWorldHint: true,
      },
    };
  });

  const toolsets = Object.entries(policy.toolsets).map<ToolsetDescriptor>(([sourceTag, id]) => ({
    id,
    sourceTag,
    currentOperations: operations.filter(
      (operation) => operation.toolsetId === id && !operation.deprecated,
    ).length,
    legacyOperations: operations.filter(
      (operation) => operation.toolsetId === id && operation.deprecated,
    ).length,
    defaultEnabled: policy.defaultToolsets.includes(id),
  }));

  return {
    schemaVersion: 1,
    sourceVersion: manifest.sourceVersion,
    sourceCanonicalSha256: manifest.sourceCanonicalSha256,
    defaultToolsets: [...policy.defaultToolsets],
    defaultToolCount: operations.filter((operation) => operation.defaultEnabled).length,
    toolsets: toolsets.sort((left, right) => left.id.localeCompare(right.id)),
    operations: operations.sort((left, right) => left.operationId.localeCompare(right.operationId)),
    warnings: sourceWarnings(sourceIds, coreIds, deprecatedIds),
  };
}

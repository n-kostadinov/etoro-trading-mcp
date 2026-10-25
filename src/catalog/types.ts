import type { OpenApiOperationDescriptor } from "../generator/manifest-types.js";

export interface ToolAnnotations {
  title: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export interface CatalogOperation extends OpenApiOperationDescriptor {
  toolsetId: string;
  deprecated: boolean;
  replacementOperationId: string | null;
  readOnly: boolean;
  realMoneyMutation: boolean;
  oauthScopeAlternatives: string[][];
  descriptionForTool: string;
  annotations: ToolAnnotations;
}

export interface ToolsetDescriptor {
  id: string;
  sourceTag: string;
  currentOperations: number;
  legacyOperations: number;
}

export interface ToolCatalog {
  schemaVersion: 1;
  sourceVersion: string;
  sourceCanonicalSha256: string;
  toolsets: ToolsetDescriptor[];
  operations: CatalogOperation[];
  warnings: string[];
}

export interface CatalogPolicyOverrides {
  schemaVersion: 1;
  toolsets: Record<string, string>;
  readOnlyOperations: string[];
  realMoneyMutationOperations: string[];
  replacements: Record<string, string>;
}

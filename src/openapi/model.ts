import { createHash } from "node:crypto";

export const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface OpenApiOperation {
  operationId: string;
  tags?: string[];
  deprecated?: boolean;
  [key: string]: unknown;
}

export interface OpenApiDocument {
  openapi: string;
  info: {
    version: string;
    [key: string]: unknown;
  };
  paths: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

export interface OperationEntry {
  operationId: string;
  method: HttpMethod;
  path: string;
  pathItem: Record<string, unknown>;
  tags: string[];
  deprecated: boolean;
  operation: OpenApiOperation;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asOpenApiDocument(value: unknown, sourceName: string): OpenApiDocument {
  if (!isRecord(value) || typeof value.openapi !== "string" || !value.openapi.startsWith("3.")) {
    throw new Error(`${sourceName} must be an OpenAPI 3.x document`);
  }
  if (!isRecord(value.info) || typeof value.info.version !== "string") {
    throw new Error(`${sourceName} is missing info.version`);
  }
  if (!isRecord(value.paths)) {
    throw new Error(`${sourceName} is missing paths`);
  }
  return value as OpenApiDocument;
}

export function getOperationEntries(document: OpenApiDocument): OperationEntry[] {
  const operations: OperationEntry[] = [];
  const operationIds = new Map<string, string>();

  for (const [path, pathItem] of Object.entries(document.paths)) {
    if (!isRecord(pathItem)) {
      throw new Error(`Path ${path} must contain an object`);
    }
    for (const method of HTTP_METHODS) {
      const candidate = pathItem[method];
      if (candidate === undefined) {
        continue;
      }
      if (!isRecord(candidate) || typeof candidate.operationId !== "string") {
        throw new Error(`${method.toUpperCase()} ${path} is missing operationId`);
      }
      if (candidate.operationId.length === 0) {
        throw new Error(`${method.toUpperCase()} ${path} has an empty operationId`);
      }
      if (candidate.tags !== undefined) {
        if (
          !Array.isArray(candidate.tags) ||
          candidate.tags.some((tag) => typeof tag !== "string")
        ) {
          throw new Error(`${candidate.operationId} has invalid tags`);
        }
      }
      const operation = candidate as OpenApiOperation;
      const identity = `${method.toUpperCase()} ${path}`;
      const previousIdentity = operationIds.get(operation.operationId);
      if (previousIdentity !== undefined) {
        throw new Error(
          `Duplicate operationId ${operation.operationId} on ${previousIdentity} and ${identity}`,
        );
      }
      operationIds.set(operation.operationId, identity);
      operations.push({
        operationId: operation.operationId,
        method,
        path,
        pathItem,
        tags: operation.tags ?? [],
        deprecated: operation.deprecated === true,
        operation,
      });
    }
  }

  return operations;
}

export function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalizeJson(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalizeJson(value));
}

export function prettyCanonicalJson(value: unknown): string {
  return `${JSON.stringify(canonicalizeJson(value), null, 2)}\n`;
}

export function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

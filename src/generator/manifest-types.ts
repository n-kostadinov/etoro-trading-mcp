import type { HttpMethod } from "../openapi/model.js";

export type JsonSchema = boolean | Record<string, unknown>;
export type ParameterLocation = "path" | "query" | "header";
export type SecurityRequirement = Record<string, string[]>;

export interface ParameterDescriptor {
  name: string;
  in: ParameterLocation;
  required: boolean;
  deprecated: boolean;
  description: string;
  style: string;
  explode: boolean;
  allowReserved: boolean;
  allowEmptyValue: boolean;
  schema: JsonSchema;
}

export interface RequestBodyDescriptor {
  required: boolean;
  description: string;
  mediaType: "application/json" | "multipart/form-data";
  schema: JsonSchema;
  hasBinary: boolean;
}

export interface ResponseDescriptor {
  status: string;
  description: string;
  mediaType: string | null;
  schema: JsonSchema | null;
}

export interface RateLimitDescriptor {
  limit: number;
  window: number;
  shared: boolean;
  defaultPool: boolean;
  sharedWith: string[];
}

export interface OpenApiOperationDescriptor {
  operationId: string;
  method: Uppercase<HttpMethod>;
  path: string;
  tags: string[];
  summary: string;
  description: string;
  sourceDeprecated: boolean;
  readOnlyExtension: boolean;
  realMoneyExtension: boolean;
  parameters: ParameterDescriptor[];
  requestBody: RequestBodyDescriptor | null;
  responses: ResponseDescriptor[];
  security: SecurityRequirement[];
  rateLimit: RateLimitDescriptor;
  inputSchema: Record<string, unknown>;
}

export interface OpenApiManifest {
  schemaVersion: 1;
  sourceVersion: string;
  sourceCanonicalSha256: string;
  operations: OpenApiOperationDescriptor[];
}

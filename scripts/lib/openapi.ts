import SwaggerParser from "@apidevtools/swagger-parser";
import type { OpenAPI } from "openapi-types";
import type { OpenApiDocument, OperationEntry } from "../../src/openapi/model.js";
import { asOpenApiDocument, getOperationEntries } from "../../src/openapi/model.js";

export * from "../../src/openapi/model.js";

export interface OpenApiSource {
  id: "swagger" | "core" | "deprecated";
  url: string;
  file: string;
}

export const OPENAPI_SOURCES: OpenApiSource[] = [
  {
    id: "swagger",
    url: "https://public-api.etoro.com/swagger/swagger.json",
    file: "etoro.swagger.json",
  },
  {
    id: "core",
    url: "https://api-portal.etoro.com/api-reference/openapi.json",
    file: "etoro.core.json",
  },
  {
    id: "deprecated",
    url: "https://api-portal.etoro.com/api-reference/deprecated-openapi.json",
    file: "etoro.deprecated.json",
  },
];

export async function validateOpenApiDocument(
  value: unknown,
  sourceName: string,
): Promise<{ document: OpenApiDocument; operations: OperationEntry[] }> {
  const document = asOpenApiDocument(value, sourceName);
  const operations = getOperationEntries(document);
  if (operations.length === 0) {
    throw new Error(`${sourceName} contains no operations`);
  }
  const parserInput = structuredClone(document) as unknown as OpenAPI.Document;
  await SwaggerParser.dereference(parserInput, { resolve: { external: false } });
  return { document, operations };
}

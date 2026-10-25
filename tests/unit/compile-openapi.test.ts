import { describe, expect, it } from "vitest";
import { compileOpenApiDocument } from "../../src/generator/compile-openapi.js";
import { asOpenApiDocument } from "../../src/openapi/model.js";

function documentWithOperation(operation: Record<string, unknown>) {
  return asOpenApiDocument(
    {
      openapi: "3.0.1",
      info: { version: "vTest" },
      security: [{ apiKeyAuth: [], userKeyAuth: [] }],
      paths: {
        "/items/{itemId}": {
          parameters: [
            {
              name: "itemId",
              in: "path",
              required: true,
              schema: { type: "integer", minimum: 1 },
            },
          ],
          get: {
            operationId: "getItem",
            tags: ["Items"],
            summary: "Get item",
            parameters: [
              {
                name: "x-request-id",
                in: "header",
                required: true,
                schema: { type: "string", format: "uuid" },
              },
              { name: "details", in: "query", schema: { type: "boolean" } },
            ],
            responses: {
              200: {
                description: "OK",
                content: { "application/json": { schema: { type: "object" } } },
              },
            },
            "x-ratelimit": { limit: 10, window: 60, shared: false, defaultPool: false },
            ...operation,
          },
        },
      },
    },
    "fixture",
  );
}

describe("OpenAPI compiler guards", () => {
  it("compiles parameters, security, responses, rate limits, and a valid input envelope", () => {
    const manifest = compileOpenApiDocument(documentWithOperation({}), {
      sourceCanonicalSha256: "a".repeat(64),
    });
    expect(manifest.sourceVersion).toBe("vTest");
    expect(manifest.operations).toHaveLength(1);
    const operation = manifest.operations[0];
    expect(operation).toMatchObject({
      operationId: "getItem",
      method: "GET",
      path: "/items/{itemId}",
      tags: ["Items"],
      rateLimit: { limit: 10, window: 60 },
      security: [{ apiKeyAuth: [], userKeyAuth: [] }],
    });
    expect(operation?.parameters).toHaveLength(3);
    expect(operation?.inputSchema.properties).toMatchObject({
      path: { required: ["itemId"] },
      query: {},
      headers: {},
    });
  });

  it("rejects multi-tag operations, callbacks, invalid tool names, and missing rate limits", () => {
    expect(() =>
      compileOpenApiDocument(documentWithOperation({ tags: ["Items", "Extra"] }), {
        sourceCanonicalSha256: "a".repeat(64),
      }),
    ).toThrow(/exactly one primary tag/u);
    expect(() =>
      compileOpenApiDocument(documentWithOperation({ callbacks: {} }), {
        sourceCanonicalSha256: "a".repeat(64),
      }),
    ).toThrow(/callbacks/u);
    expect(() =>
      compileOpenApiDocument(documentWithOperation({ operationId: "invalid name" }), {
        sourceCanonicalSha256: "a".repeat(64),
      }),
    ).toThrow(/valid MCP tool name/u);
    expect(() =>
      compileOpenApiDocument(documentWithOperation({ "x-ratelimit": undefined }), {
        sourceCanonicalSha256: "a".repeat(64),
      }),
    ).toThrow(/missing x-ratelimit/u);
  });

  it("rejects unsupported request media types and server overrides", () => {
    const textBody = documentWithOperation({
      requestBody: { required: true, content: { "text/plain": { schema: { type: "string" } } } },
    });
    expect(() =>
      compileOpenApiDocument(textBody, { sourceCanonicalSha256: "a".repeat(64) }),
    ).toThrow(/unsupported request media type text\/plain/u);

    const serverOverride = documentWithOperation({ servers: [] });
    expect(() =>
      compileOpenApiDocument(serverOverride, { sourceCanonicalSha256: "a".repeat(64) }),
    ).toThrow(/server override/u);
  });
});

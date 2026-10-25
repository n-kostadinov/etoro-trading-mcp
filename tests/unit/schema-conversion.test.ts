import { describe, expect, it } from "vitest";
import { asOpenApiDocument } from "../../src/openapi/model.js";
import {
  attachDefinitions,
  convertSchema,
  createSchemaContext,
} from "../../src/generator/schema.js";

const document = asOpenApiDocument(
  {
    openapi: "3.0.1",
    info: { version: "vTest" },
    paths: {},
    components: {
      schemas: {
        Trade: {
          type: "object",
          required: ["symbol"],
          properties: { symbol: { type: "string", minLength: 1 } },
        },
      },
    },
  },
  "fixture",
);

describe("OpenAPI schema conversion", () => {
  it("converts nullable primitives, enums, and OpenAPI 3.1 type arrays", () => {
    const context = createSchemaContext(document);
    expect(convertSchema({ type: "string", nullable: true }, context)).toEqual({
      type: ["string", "null"],
    });
    expect(convertSchema({ enum: ["buy"], nullable: true }, context)).toEqual({
      enum: ["buy", null],
    });
    expect(convertSchema({ type: ["string", "number"], nullable: true }, context)).toEqual({
      type: ["string", "number", "null"],
    });
  });

  it("normalizes both supported exclusive-bound forms", () => {
    const context = createSchemaContext(document);
    expect(convertSchema({ type: "number", minimum: 1, exclusiveMinimum: true }, context)).toEqual({
      type: "number",
      exclusiveMinimum: 1,
    });
    expect(convertSchema({ type: "number", exclusiveMinimum: 2 }, context)).toEqual({
      type: "number",
      exclusiveMinimum: 2,
    });
    expect(() => convertSchema({ exclusiveMinimum: "yes" }, context)).toThrow(/exclusiveMinimum/u);
  });

  it("rewrites schema references into local definitions and attaches them once", () => {
    const context = createSchemaContext(document);
    const converted = convertSchema(
      { type: "array", items: { $ref: "#/components/schemas/Trade" } },
      context,
    );
    const attached = attachDefinitions(converted, context) as Record<string, unknown>;
    const definitions = attached.$defs as Record<string, unknown>;
    expect((converted as { items: { $ref: string } }).items.$ref).toBe("#/$defs/Trade");
    expect(definitions.Trade).toEqual({
      type: "object",
      required: ["symbol"],
      properties: { symbol: { type: "string", minLength: 1 } },
    });
  });

  it("converts binary multipart fields into explicit local-file objects", () => {
    const context = createSchemaContext(document);
    context.binaryMode = true;
    const converted = convertSchema(
      { format: "binary", description: "PNG or JPEG file" },
      context,
    ) as Record<string, unknown>;
    expect(converted["x-etoro-local-file"]).toBe(true);
    expect(converted.description).toBe("PNG or JPEG file");
    expect(converted.required).toEqual(["filePath"]);
  });

  it("rejects external or unsupported schema references", () => {
    const context = createSchemaContext(document);
    expect(() => convertSchema({ $ref: "https://example.com/schema.json" }, context)).toThrow(
      /Unsupported schema reference/u,
    );
    expect(() => convertSchema({ $ref: "#/components/parameters/Id" }, context)).toThrow(
      /Unsupported schema reference/u,
    );
  });
});

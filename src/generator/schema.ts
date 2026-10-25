import type { JsonSchema } from "./manifest-types.js";
import { isRecord, type OpenApiDocument } from "../openapi/model.js";

export interface SchemaConversionContext {
  document: OpenApiDocument;
  definitions: Map<string, unknown>;
  binaryMode: boolean;
  hasBinary: boolean;
}

export function createSchemaContext(document: OpenApiDocument): SchemaConversionContext {
  return { document, definitions: new Map(), binaryMode: false, hasBinary: false };
}

function decodePointerSegment(value: string): string {
  return value.replaceAll("~1", "/").replaceAll("~0", "~");
}

function encodePointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function componentSchema(document: OpenApiDocument, name: string): unknown {
  const components = document.components;
  if (!isRecord(components) || !isRecord(components.schemas)) {
    throw new Error("OpenAPI document has no components.schemas object");
  }
  const schema = components.schemas[name];
  if (schema === undefined) {
    throw new Error(`Unknown schema component ${name}`);
  }
  return schema;
}

function registerDefinition(name: string, context: SchemaConversionContext): void {
  if (context.definitions.has(name)) {
    return;
  }
  context.definitions.set(name, true);
  const converted = convertSchema(componentSchema(context.document, name), context);
  context.definitions.set(name, converted);
}

function convertReference(reference: string, context: SchemaConversionContext): string {
  const prefix = "#/components/schemas/";
  if (!reference.startsWith(prefix)) {
    throw new Error(`Unsupported schema reference ${reference}`);
  }
  const [encodedName, ...nestedPath] = reference.slice(prefix.length).split("/");
  if (encodedName === undefined || encodedName.length === 0) {
    throw new Error(`Invalid schema reference ${reference}`);
  }
  const name = decodePointerSegment(encodedName);
  registerDefinition(name, context);
  const suffix = nestedPath.length > 0 ? `/${nestedPath.join("/")}` : "";
  return `#/$defs/${encodePointerSegment(name)}${suffix}`;
}

function localFileSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {
    type: "object",
    additionalProperties: false,
    required: ["filePath"],
    properties: {
      filePath: {
        type: "string",
        minLength: 1,
        description: "Absolute or working-directory-relative path to the local file to upload.",
      },
      fileName: {
        type: "string",
        minLength: 1,
        description: "Optional filename sent to eToro; defaults to the filePath basename.",
      },
      contentType: {
        type: "string",
        minLength: 1,
        description: "Optional media type; validated against the actual file content.",
      },
    },
    "x-etoro-local-file": true,
  };
  if (typeof schema.description === "string") {
    result.description = schema.description;
  }
  if (typeof schema.title === "string") {
    result.title = schema.title;
  }
  return result;
}

function convertSchemaMap(
  value: unknown,
  context: SchemaConversionContext,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error("Expected a schema map");
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, convertSchema(child, context)]),
  );
}

function convertExclusiveBound(
  output: Record<string, unknown>,
  exclusiveKey: "exclusiveMinimum" | "exclusiveMaximum",
  minimumKey: "minimum" | "maximum",
): void {
  const value = output[exclusiveKey];
  if (value === undefined) {
    return;
  }
  if (typeof value === "number") {
    return;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${exclusiveKey} must be a number or boolean`);
  }
  delete output[exclusiveKey];
  if (value && typeof output[minimumKey] === "number") {
    output[exclusiveKey] = output[minimumKey];
    delete output[minimumKey];
  }
}

function applyNullable(output: Record<string, unknown>): Record<string, unknown> {
  const type = output.type;
  if (output.const !== undefined) {
    return { anyOf: [output, { type: "null" }] };
  }
  if (Array.isArray(output.enum)) {
    if (!output.enum.includes(null)) {
      output.enum.push(null);
    }
    if (typeof type === "string") {
      output.type = [type, "null"];
    } else if (Array.isArray(type) && !type.includes("null")) {
      output.type = [...type, "null"];
    }
    return output;
  }
  if (typeof type === "string") {
    output.type = [type, "null"];
    return output;
  }
  if (Array.isArray(type)) {
    output.type = type.includes("null") ? type : [...type, "null"];
    return output;
  }
  return { anyOf: [output, { type: "null" }] };
}

export function convertSchema(value: unknown, context: SchemaConversionContext): JsonSchema {
  if (typeof value === "boolean") {
    return value;
  }
  if (!isRecord(value)) {
    throw new Error("Expected a schema object or boolean");
  }
  if (context.binaryMode && value.format === "binary") {
    context.hasBinary = true;
    return localFileSchema(value);
  }

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (["nullable", "discriminator", "xml", "externalDocs"].includes(key)) {
      continue;
    }
    if (key === "$ref" && typeof child === "string") {
      output.$ref = convertReference(child, context);
      continue;
    }
    if (
      ["properties", "patternProperties", "$defs", "definitions", "dependentSchemas"].includes(key)
    ) {
      output[key] = convertSchemaMap(child, context);
      continue;
    }
    if (key === "items") {
      output.items = Array.isArray(child)
        ? child.map((item) => convertSchema(item, context))
        : convertSchema(child, context);
      continue;
    }
    if (["allOf", "anyOf", "oneOf", "prefixItems"].includes(key)) {
      if (!Array.isArray(child)) {
        throw new Error(`${key} must be an array of schemas`);
      }
      output[key] = child.map((item) => convertSchema(item, context));
      continue;
    }
    if (
      ["additionalProperties", "contains", "not", "if", "then", "else", "propertyNames"].includes(
        key,
      ) &&
      isRecord(child)
    ) {
      output[key] = convertSchema(child, context);
      continue;
    }
    if (key === "example") {
      output.examples = [structuredClone(child)];
      continue;
    }
    output[key] = structuredClone(child);
  }

  convertExclusiveBound(output, "exclusiveMinimum", "minimum");
  convertExclusiveBound(output, "exclusiveMaximum", "maximum");
  return value.nullable === true ? applyNullable(output) : output;
}

export function attachDefinitions(
  schema: JsonSchema,
  context: SchemaConversionContext,
): JsonSchema {
  if (context.definitions.size === 0) {
    return schema;
  }
  if (!isRecord(schema)) {
    throw new Error("A boolean root schema cannot carry referenced definitions");
  }
  const existing = isRecord(schema.$defs) ? schema.$defs : {};
  return {
    ...schema,
    $defs: { ...existing, ...Object.fromEntries(context.definitions) },
  };
}

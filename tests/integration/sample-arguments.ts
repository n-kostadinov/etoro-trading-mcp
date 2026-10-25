import type { CatalogOperation } from "../../src/catalog/types.js";
import type { JsonSchema } from "../../src/generator/manifest-types.js";
import { isRecord } from "../../src/openapi/model.js";
import type { ToolArguments } from "../../src/transport/types.js";

export interface SampleContext {
  attachmentFilePath: string;
}

const FIXED_UUID = "11111111-1111-4111-8111-111111111111";

function resolveReference(reference: string, root: Record<string, unknown>): JsonSchema {
  if (!reference.startsWith("#/")) {
    throw new Error(`Test generator cannot resolve external reference ${reference}`);
  }
  let current: unknown = root;
  for (const rawSegment of reference.slice(2).split("/")) {
    const segment = rawSegment.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!isRecord(current) || current[segment] === undefined) {
      throw new Error(`Test generator cannot resolve ${reference}`);
    }
    current = current[segment];
  }
  return current as JsonSchema;
}

function schemaExample(schema: Record<string, unknown>): unknown {
  if (Array.isArray(schema.examples) && schema.examples.length > 0) {
    return schema.examples[0];
  }
  if (schema.default !== undefined) {
    return schema.default;
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum.find((value) => value !== null) ?? schema.enum[0];
  }
  if (schema.const !== undefined) {
    return schema.const;
  }
  return undefined;
}

function stringValue(schema: Record<string, unknown>): string {
  const format = schema.format;
  const minLength = typeof schema.minLength === "number" ? schema.minLength : 1;
  if (format === "uuid") {
    return FIXED_UUID;
  }
  if (format === "date-time") {
    return "2026-10-24T00:00:00Z";
  }
  if (format === "date") {
    return "2026-10-24";
  }
  if (format === "email") {
    return "agent@example.com";
  }
  if (format === "uri") {
    return "https://example.com/";
  }
  return "x".repeat(Math.max(minLength, 1));
}

function numericValue(schema: Record<string, unknown>, integer: boolean): number {
  const increment = integer ? 1 : 1.5;
  let lower = typeof schema.minimum === "number" ? schema.minimum : 1;
  if (typeof schema.exclusiveMinimum === "number") {
    lower = Math.max(lower, schema.exclusiveMinimum + increment);
  }
  if (typeof schema.maximum === "number") {
    const upper =
      typeof schema.exclusiveMaximum === "number"
        ? schema.exclusiveMaximum - increment
        : schema.maximum;
    if (upper < lower) {
      throw new Error(
        `Test generator cannot satisfy numeric bounds in schema: ${upper} < ${lower}`,
      );
    }
    lower = upper;
  }
  const multipleOf = typeof schema.multipleOf === "number" ? schema.multipleOf : undefined;
  if (multipleOf === undefined) {
    return integer ? Math.round(lower) : lower;
  }
  const scaled = Math.ceil(lower / multipleOf) * multipleOf;
  return Number(scaled.toFixed(6));
}

function mergeObjectSamples(samples: unknown[]): Record<string, unknown> {
  return Object.assign(
    {},
    ...samples.filter((sample): sample is Record<string, unknown> => isRecord(sample)),
  );
}

export function sampleFromSchema(
  schema: JsonSchema,
  root: Record<string, unknown>,
  context: SampleContext,
): unknown {
  if (typeof schema === "boolean") {
    return {};
  }
  const example = schemaExample(schema);
  if (example !== undefined) {
    return structuredClone(example);
  }
  if (Array.isArray(schema.allOf)) {
    return mergeObjectSamples(
      schema.allOf.map((child) => sampleFromSchema(child as JsonSchema, root, context)),
    );
  }
  for (const key of ["anyOf", "oneOf"] as const) {
    const alternatives = schema[key];
    if (Array.isArray(alternatives) && alternatives.length > 0) {
      return sampleFromSchema(alternatives[0] as JsonSchema, root, context);
    }
  }
  if (typeof schema.$ref === "string") {
    return sampleFromSchema(resolveReference(schema.$ref, root), root, context);
  }
  if (schema["x-etoro-local-file"] === true) {
    return { filePath: context.attachmentFilePath };
  }
  const type = Array.isArray(schema.type)
    ? (schema.type.find((candidate) => candidate !== "null") ?? "object")
    : schema.type;
  if (type === "string") {
    return stringValue(schema);
  }
  if (type === "integer" || type === "number") {
    return numericValue(schema, type === "integer");
  }
  if (type === "boolean") {
    return false;
  }
  if (type === "array") {
    const itemSchema = Array.isArray(schema.items)
      ? (schema.items[0] as JsonSchema)
      : (schema.items as JsonSchema | undefined);
    const itemCount = typeof schema.minItems === "number" ? Math.max(schema.minItems, 1) : 1;
    return Array.from(
      { length: itemCount },
      () => sampleFromSchema(itemSchema ?? {}, root, context) as unknown,
    );
  }
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required)
    ? schema.required.filter((name): name is string => typeof name === "string")
    : [];
  const sample: Record<string, unknown> = {};
  for (const name of required) {
    const propertySchema = properties[name];
    sample[name] =
      propertySchema === undefined
        ? {}
        : sampleFromSchema(propertySchema as JsonSchema, root, context);
  }
  return sample;
}

function requiredLocation(
  schema: JsonSchema | undefined,
  root: Record<string, unknown>,
  context: SampleContext,
): Record<string, unknown> | undefined {
  if (schema === undefined || typeof schema === "boolean") {
    return undefined;
  }
  const required = Array.isArray(schema.required)
    ? schema.required.filter((name): name is string => typeof name === "string")
    : [];
  if (required.length === 0) {
    return undefined;
  }
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const location: Record<string, unknown> = {};
  for (const name of required) {
    location[name] =
      properties[name] === undefined
        ? {}
        : sampleFromSchema(properties[name] as JsonSchema, root, context);
  }
  return location;
}

export function validArgumentsForOperation(
  operation: CatalogOperation,
  context: SampleContext,
): ToolArguments {
  const root = operation.inputSchema;
  const properties = isRecord(root.properties) ? root.properties : {};
  const path = requiredLocation(properties.path as JsonSchema | undefined, root, context);
  const query = requiredLocation(properties.query as JsonSchema | undefined, root, context);
  const headers = requiredLocation(properties.headers as JsonSchema | undefined, root, context);
  const bodyRequired = Array.isArray(root.required) && root.required.includes("body");
  const body = bodyRequired
    ? sampleFromSchema(properties.body as JsonSchema, root, context)
    : undefined;
  const args: ToolArguments = {};
  if (path !== undefined) {
    args.path = path;
  }
  if (query !== undefined) {
    args.query = query;
  }
  if (headers !== undefined) {
    args.headers = headers;
  }
  if (body !== undefined) {
    args.body = body;
  }
  return args;
}

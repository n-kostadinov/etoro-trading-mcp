import { Ajv2020 } from "ajv/dist/2020.js";
import {
  getOperationEntries,
  isRecord,
  type HttpMethod,
  type OpenApiDocument,
  type OperationEntry,
} from "../openapi/model.js";
import type {
  OpenApiManifest,
  OpenApiOperationDescriptor,
  ParameterDescriptor,
  ParameterLocation,
  RateLimitDescriptor,
  RequestBodyDescriptor,
  ResponseDescriptor,
  SecurityRequirement,
} from "./manifest-types.js";
import { attachDefinitions, convertSchema, createSchemaContext } from "./schema.js";

const AUTHENTICATION_HEADERS = new Set(["authorization", "x-api-key", "x-user-key"]);
const REQUEST_ID_HEADER = "x-request-id";

function decodePointerSegment(value: string): string {
  return value.replaceAll("~1", "/").replaceAll("~0", "~");
}

function resolvePointer(document: OpenApiDocument, reference: string): unknown {
  if (!reference.startsWith("#/")) {
    throw new Error(`External reference is not supported: ${reference}`);
  }
  let current: unknown = document;
  for (const segment of reference.slice(2).split("/").map(decodePointerSegment)) {
    if (!isRecord(current) || current[segment] === undefined) {
      throw new Error(`Unable to resolve ${reference}`);
    }
    current = current[segment];
  }
  return current;
}

function resolveObject(
  document: OpenApiDocument,
  value: unknown,
  seenReferences = new Set<string>(),
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error("Expected an OpenAPI object");
  }
  if (typeof value.$ref !== "string") {
    return value;
  }
  if (seenReferences.has(value.$ref)) {
    throw new Error(`Cyclic OpenAPI object reference: ${value.$ref}`);
  }
  seenReferences.add(value.$ref);
  return resolveObject(document, resolvePointer(document, value.$ref), seenReferences);
}

function objectArray(value: unknown): unknown[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error("Expected an array");
  }
  return value;
}

function compileParameters(
  entry: OperationEntry,
  document: OpenApiDocument,
  context: ReturnType<typeof createSchemaContext>,
): ParameterDescriptor[] {
  const merged = new Map<string, ParameterDescriptor>();
  const rawParameters = [
    ...objectArray(entry.pathItem.parameters),
    ...objectArray(entry.operation.parameters),
  ];

  for (const raw of rawParameters) {
    const parameter = resolveObject(document, raw);
    const name = parameter.name;
    const location = parameter.in;
    if (typeof name !== "string" || !["path", "query", "header"].includes(String(location))) {
      throw new Error(`${entry.operationId} has an unsupported parameter ${String(name)}`);
    }
    if (parameter.content !== undefined || parameter.schema === undefined) {
      throw new Error(`${entry.operationId} parameter ${name} must use a schema`);
    }
    const parameterLocation = location as ParameterLocation;
    const style =
      typeof parameter.style === "string"
        ? parameter.style
        : parameterLocation === "query"
          ? "form"
          : "simple";
    const descriptor: ParameterDescriptor = {
      name,
      in: parameterLocation,
      required: parameterLocation === "path" || parameter.required === true,
      deprecated: parameter.deprecated === true,
      description: typeof parameter.description === "string" ? parameter.description : "",
      style,
      explode: typeof parameter.explode === "boolean" ? parameter.explode : style === "form",
      allowReserved: parameter.allowReserved === true,
      allowEmptyValue: parameter.allowEmptyValue === true,
      schema: convertSchema(parameter.schema, context),
    };
    merged.set(`${parameterLocation}:${name}`, descriptor);
  }

  return [...merged.values()];
}

function compileRequestBody(
  entry: OperationEntry,
  document: OpenApiDocument,
  context: ReturnType<typeof createSchemaContext>,
): RequestBodyDescriptor | null {
  if (entry.operation.requestBody === undefined) {
    return null;
  }
  const requestBody = resolveObject(document, entry.operation.requestBody);
  if (!isRecord(requestBody.content)) {
    throw new Error(`${entry.operationId} requestBody has no content`);
  }
  const content = Object.entries(requestBody.content);
  if (content.length !== 1) {
    throw new Error(`${entry.operationId} must have exactly one request media type`);
  }
  const [mediaType, rawMedia] = content[0] ?? [];
  if (mediaType !== "application/json" && mediaType !== "multipart/form-data") {
    throw new Error(`${entry.operationId} has unsupported request media type ${mediaType}`);
  }
  if (!isRecord(rawMedia)) {
    throw new Error(`${entry.operationId} has an invalid request media type object`);
  }
  context.binaryMode = mediaType === "multipart/form-data";
  context.hasBinary = false;
  const schema = convertSchema(rawMedia.schema ?? {}, context);
  context.binaryMode = false;
  return {
    required: requestBody.required === true,
    description: typeof requestBody.description === "string" ? requestBody.description : "",
    mediaType,
    schema,
    hasBinary: context.hasBinary,
  };
}

function compileResponses(entry: OperationEntry, document: OpenApiDocument): ResponseDescriptor[] {
  if (!isRecord(entry.operation.responses)) {
    throw new Error(`${entry.operationId} has no responses`);
  }
  return Object.entries(entry.operation.responses).map(([status, rawResponse]) => {
    const response = resolveObject(document, rawResponse);
    if (response.content !== undefined && !isRecord(response.content)) {
      throw new Error(`${entry.operationId} response ${status} has invalid content`);
    }
    const content = isRecord(response.content) ? Object.entries(response.content) : [];
    if (content.length > 1) {
      throw new Error(`${entry.operationId} response ${status} has multiple media types`);
    }
    const [mediaType, rawMedia] = content[0] ?? [];
    if (mediaType !== undefined && mediaType !== "application/json") {
      throw new Error(
        `${entry.operationId} response ${status} has unsupported media type ${mediaType}`,
      );
    }
    if (rawMedia !== undefined && !isRecord(rawMedia)) {
      throw new Error(`${entry.operationId} response ${status} has an invalid media type object`);
    }
    const rawSchema = isRecord(rawMedia) ? rawMedia.schema : undefined;
    const context = createSchemaContext(document);
    const schema =
      rawSchema === undefined
        ? null
        : attachDefinitions(convertSchema(rawSchema, context), context);
    return {
      status,
      description: typeof response.description === "string" ? response.description : "",
      mediaType: mediaType ?? null,
      schema,
    };
  });
}

function compileSecurity(entry: OperationEntry, document: OpenApiDocument): SecurityRequirement[] {
  const rawSecurity = entry.operation.security ?? document.security ?? [];
  return objectArray(rawSecurity).map((rawRequirement) => {
    if (!isRecord(rawRequirement)) {
      throw new Error(`${entry.operationId} has an invalid security requirement`);
    }
    return Object.fromEntries(
      Object.entries(rawRequirement).map(([scheme, scopes]) => {
        if (!Array.isArray(scopes) || scopes.some((scope) => typeof scope !== "string")) {
          throw new Error(`${entry.operationId} has invalid scopes for ${scheme}`);
        }
        return [scheme, scopes];
      }),
    );
  });
}

function compileRateLimit(entry: OperationEntry): RateLimitDescriptor {
  const rateLimit = entry.operation["x-ratelimit"];
  if (!isRecord(rateLimit)) {
    throw new Error(`${entry.operationId} is missing x-ratelimit`);
  }
  if (
    typeof rateLimit.limit !== "number" ||
    typeof rateLimit.window !== "number" ||
    rateLimit.limit <= 0 ||
    rateLimit.window <= 0
  ) {
    throw new Error(`${entry.operationId} has invalid rate-limit values`);
  }
  return {
    limit: rateLimit.limit,
    window: rateLimit.window,
    shared: rateLimit.shared === true,
    defaultPool: rateLimit.defaultPool === true,
    sharedWith: Array.isArray(rateLimit.sharedWith)
      ? rateLimit.sharedWith.filter((value): value is string => typeof value === "string")
      : [],
  };
}

function inputLocation(
  parameters: ParameterDescriptor[],
  location: ParameterLocation,
): Record<string, unknown> | null {
  const matching = parameters.filter((parameter) => parameter.in === location);
  if (matching.length === 0) {
    return null;
  }
  const properties = Object.fromEntries(
    matching
      .filter((parameter) => !AUTHENTICATION_HEADERS.has(parameter.name.toLowerCase()))
      .map((parameter) => [parameter.name, parameter.schema]),
  );
  const required = matching
    .filter(
      (parameter) =>
        parameter.required &&
        parameter.name.toLowerCase() !== REQUEST_ID_HEADER &&
        !AUTHENTICATION_HEADERS.has(parameter.name.toLowerCase()),
    )
    .map((parameter) => parameter.name);
  return {
    type: "object",
    additionalProperties: false,
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

function compileInputSchema(
  parameters: ParameterDescriptor[],
  requestBody: RequestBodyDescriptor | null,
  context: ReturnType<typeof createSchemaContext>,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [location, property] of [
    ["path", inputLocation(parameters, "path")],
    ["query", inputLocation(parameters, "query")],
    ["headers", inputLocation(parameters, "header")],
  ] as const) {
    if (property === null) {
      continue;
    }
    properties[location] = property;
    if (Array.isArray(property.required) && property.required.length > 0) {
      required.push(location);
    }
  }
  if (requestBody !== null) {
    properties.body = requestBody.schema;
    if (requestBody.required) {
      required.push("body");
    }
  }
  const input: Record<string, unknown> = {
    type: "object",
    additionalProperties: false,
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
  const withDefinitions = attachDefinitions(input, context);
  if (!isRecord(withDefinitions)) {
    throw new Error("Tool input schema must be an object");
  }
  return withDefinitions;
}

function assertToolName(operationId: string): void {
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(operationId)) {
    throw new Error(`OperationId is not a valid MCP tool name: ${operationId}`);
  }
}

function compileOperation(
  entry: OperationEntry,
  document: OpenApiDocument,
  ajv: Ajv2020,
): OpenApiOperationDescriptor {
  assertToolName(entry.operationId);
  if (entry.tags.length !== 1) {
    throw new Error(`${entry.operationId} must have exactly one primary tag`);
  }
  if (entry.operation.callbacks !== undefined) {
    throw new Error(`${entry.operationId} callbacks are not supported`);
  }
  if (entry.operation.servers !== undefined || entry.pathItem.servers !== undefined) {
    throw new Error(`${entry.operationId} has an unsupported server override`);
  }
  const context = createSchemaContext(document);
  const parameters = compileParameters(entry, document, context);
  const requestBody = compileRequestBody(entry, document, context);
  const inputSchema = compileInputSchema(parameters, requestBody, context);
  ajv.compile(inputSchema);
  return {
    operationId: entry.operationId,
    method: entry.method.toUpperCase() as Uppercase<HttpMethod>,
    path: entry.path,
    tags: entry.tags,
    summary:
      typeof entry.operation.summary === "string" ? entry.operation.summary : entry.operationId,
    description: typeof entry.operation.description === "string" ? entry.operation.description : "",
    sourceDeprecated: entry.deprecated,
    readOnlyExtension: entry.operation["x-read-only"] === true,
    realMoneyExtension: entry.operation["x-real-money"] === true,
    parameters,
    requestBody,
    responses: compileResponses(entry, document),
    security: compileSecurity(entry, document),
    rateLimit: compileRateLimit(entry),
    inputSchema,
  };
}

function assertCoverage(document: OpenApiDocument, operations: OpenApiOperationDescriptor[]): void {
  const source = getOperationEntries(document).map(
    (entry) => `${entry.method.toUpperCase()} ${entry.path}`,
  );
  const generated = operations.map((entry) => `${entry.method} ${entry.path}`);
  const missing = source.filter((identity) => !generated.includes(identity));
  const unexpected = generated.filter((identity) => !source.includes(identity));
  if (missing.length > 0 || unexpected.length > 0 || generated.length !== source.length) {
    throw new Error(
      `Operation coverage mismatch; missing=${missing.join(",")}; unexpected=${unexpected.join(",")}`,
    );
  }
}

export function compileOpenApiDocument(
  document: OpenApiDocument,
  options: { sourceCanonicalSha256: string },
): OpenApiManifest {
  const ajv = new Ajv2020({ strict: false, validateFormats: false, allowUnionTypes: true });
  const operations = getOperationEntries(document)
    .map((entry) => compileOperation(entry, document, ajv))
    .sort((left, right) => left.operationId.localeCompare(right.operationId));
  assertCoverage(document, operations);
  return {
    schemaVersion: 1,
    sourceVersion: document.info.version,
    sourceCanonicalSha256: options.sourceCanonicalSha256,
    operations,
  };
}

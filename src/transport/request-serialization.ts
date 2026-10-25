import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { isRecord } from "../openapi/model.js";
import type { CatalogOperation } from "../catalog/types.js";
import type { ParameterDescriptor } from "../generator/manifest-types.js";
import type { CredentialConfiguration } from "./credentials.js";
import { authenticationHeaders } from "./credentials.js";
import type { ToolArguments } from "./types.js";

const AUTHENTICATION_ARGUMENT_HEADERS = new Set(["authorization", "x-api-key", "x-user-key"]);
const REQUEST_ID_HEADER = "x-request-id";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export interface SerializedRequest {
  method: string;
  path: string;
  query: string;
  headers: Record<string, string>;
  body: string | FormData | undefined;
  requestId: string;
}

export class TransportSerializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransportSerializationError";
  }
}

function primitiveValue(value: unknown, parameter: ParameterDescriptor): string {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  throw new TransportSerializationError(`Parameter ${parameter.name} must be a primitive value`);
}

function encodeQueryValue(value: string, allowReserved: boolean): string {
  const encoded = encodeURIComponent(value);
  if (!allowReserved) {
    return encoded;
  }
  return encoded.replaceAll(
    /%3A|%2F|%3F|%23|%5B|%5D|%40|%21|%24|%26|%27|%28|%29|%2A|%2C|%3B|%3D/g,
    (match) =>
      ({
        "%3A": ":",
        "%2F": "/",
        "%3F": "?",
        "%23": "#",
        "%5B": "[",
        "%5D": "]",
        "%40": "@",
        "%21": "!",
        "%24": "$",
        "%26": "&",
        "%27": "'",
        "%28": "(",
        "%29": ")",
        "%2A": "*",
        "%2C": ",",
        "%3B": ";",
        "%3D": "=",
      })[match] ?? match,
  );
}

function queryParts(parameter: ParameterDescriptor, value: unknown): string[] {
  if (Array.isArray(value)) {
    const encoded = value.map((item) =>
      encodeQueryValue(primitiveValue(item, parameter), parameter.allowReserved),
    );
    return parameter.explode
      ? encoded.map((item) => `${parameter.name}=${item}`)
      : [`${parameter.name}=${encoded.join(",")}`];
  }
  if (isRecord(value)) {
    const entries = Object.entries(value).map(([key, item]) => ({
      key,
      value: primitiveValue(item, parameter),
    }));
    if (parameter.explode) {
      return entries.map(
        (entry) => `${encodeQueryValue(entry.key, false)}=${encodeQueryValue(entry.value, false)}`,
      );
    }
    return [
      `${parameter.name}=${entries
        .map(
          (entry) =>
            `${encodeQueryValue(entry.key, false)},${encodeQueryValue(entry.value, false)}`,
        )
        .join(",")}`,
    ];
  }
  return [
    `${parameter.name}=${encodeQueryValue(primitiveValue(value, parameter), parameter.allowReserved)}`,
  ];
}

function serializeQuery(operation: CatalogOperation, args: ToolArguments): string {
  const parts: string[] = [];
  for (const parameter of operation.parameters.filter((item) => item.in === "query")) {
    const value = args.query?.[parameter.name];
    if (value === undefined || value === null) {
      if (parameter.required) {
        throw new TransportSerializationError(`Missing required query parameter ${parameter.name}`);
      }
      continue;
    }
    if (parameter.style !== "form") {
      throw new TransportSerializationError(
        `Unsupported query style ${parameter.style} for ${parameter.name}`,
      );
    }
    parts.push(...queryParts(parameter, value));
  }
  return parts.join("&");
}

function serializePath(operation: CatalogOperation, args: ToolArguments): string {
  let result = operation.path;
  for (const parameter of operation.parameters.filter((item) => item.in === "path")) {
    const value = args.path?.[parameter.name];
    if (value === undefined || value === null) {
      throw new TransportSerializationError(`Missing required path parameter ${parameter.name}`);
    }
    if (parameter.style !== "simple") {
      throw new TransportSerializationError(
        `Unsupported path style ${parameter.style} for ${parameter.name}`,
      );
    }
    const valueText = Array.isArray(value)
      ? value.map((item) => encodeURIComponent(primitiveValue(item, parameter))).join(",")
      : encodeURIComponent(primitiveValue(value, parameter));
    result = result.replaceAll(`{${parameter.name}}`, valueText);
  }
  if (result.includes("{")) {
    throw new TransportSerializationError(`Path ${result} contains an unresolved parameter`);
  }
  return result;
}

function headerValue(parameter: ParameterDescriptor, value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => primitiveValue(item, parameter)).join(",");
  }
  return primitiveValue(value, parameter);
}

function requestIdFromArguments(args: ToolArguments, generateRequestId: () => string): string {
  const supplied = args.headers?.[REQUEST_ID_HEADER];
  if (supplied === undefined) {
    return generateRequestId();
  }
  if (typeof supplied !== "string" || !UUID_PATTERN.test(supplied)) {
    throw new TransportSerializationError("headers.x-request-id must be a UUID");
  }
  return supplied;
}

function validateArgumentLocations(operation: CatalogOperation, args: ToolArguments): void {
  const expected = new Map(
    operation.parameters.map((parameter) => [`${parameter.in}:${parameter.name}`, parameter]),
  );
  const locations: Array<[keyof ToolArguments, ParameterDescriptor["in"]]> = [
    ["path", "path"],
    ["query", "query"],
    ["headers", "header"],
  ];
  for (const [argumentLocation, parameterLocation] of locations) {
    const values = args[argumentLocation];
    if (values === undefined) {
      continue;
    }
    if (!isRecord(values)) {
      throw new TransportSerializationError(`${argumentLocation} arguments must be an object`);
    }
    for (const name of Object.keys(values)) {
      if (AUTHENTICATION_ARGUMENT_HEADERS.has(name.toLowerCase())) {
        throw new TransportSerializationError(
          `${argumentLocation}.${name} is supplied by the server credential configuration`,
        );
      }
      if (!expected.has(`${parameterLocation}:${name}`)) {
        throw new TransportSerializationError(
          `Unknown ${argumentLocation} argument ${name} for ${operation.operationId}`,
        );
      }
    }
  }
  if (operation.requestBody === null && args.body !== undefined) {
    throw new TransportSerializationError(`${operation.operationId} does not accept a body`);
  }
}

function detectImageContentType(bytes: Buffer): "image/png" | "image/jpeg" {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  throw new TransportSerializationError("Attachment must be a PNG or JPEG file");
}

async function multipartBody(
  operation: CatalogOperation,
  schema: Record<string, unknown>,
  value: unknown,
): Promise<FormData> {
  if (!isRecord(value)) {
    throw new TransportSerializationError(
      `${operation.operationId} multipart body must be an object`,
    );
  }
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const form = new FormData();
  for (const [name, propertySchema] of Object.entries(properties)) {
    const fieldValue = value[name];
    if (fieldValue === undefined || fieldValue === null) {
      continue;
    }
    if (isRecord(propertySchema) && propertySchema["x-etoro-local-file"] === true) {
      if (!isRecord(fieldValue)) {
        throw new TransportSerializationError(`body.${name} must be a local file object`);
      }
      const filePath = fieldValue.filePath;
      const fileName = fieldValue.fileName;
      const contentType = fieldValue.contentType;
      if (typeof filePath !== "string" || filePath.length === 0) {
        throw new TransportSerializationError(`body.${name}.filePath must be a non-empty string`);
      }
      if (fileName !== undefined && typeof fileName !== "string") {
        throw new TransportSerializationError(`body.${name}.fileName must be a string`);
      }
      if (contentType !== undefined && typeof contentType !== "string") {
        throw new TransportSerializationError(`body.${name}.contentType must be a string`);
      }
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        throw new TransportSerializationError(`body.${name}.filePath is not a regular file`);
      }
      if (fileStat.size > MAX_ATTACHMENT_BYTES) {
        throw new TransportSerializationError(
          `body.${name}.filePath exceeds the 8 MiB attachment limit`,
        );
      }
      const bytes = await readFile(filePath);
      const detectedContentType = detectImageContentType(bytes);
      if (contentType !== undefined && contentType.toLowerCase() !== detectedContentType) {
        throw new TransportSerializationError(
          `body.${name}.contentType is ${contentType}, but the file content is ${detectedContentType}`,
        );
      }
      form.append(
        name,
        new Blob([bytes], { type: detectedContentType }),
        fileName ?? path.basename(filePath),
      );
      continue;
    }
    if (
      typeof fieldValue === "string" ||
      typeof fieldValue === "number" ||
      typeof fieldValue === "boolean"
    ) {
      form.append(name, String(fieldValue));
      continue;
    }
    throw new TransportSerializationError(`Unsupported multipart field body.${name}`);
  }
  return form;
}

export async function serializeRequest(
  operation: CatalogOperation,
  args: ToolArguments,
  credentials: CredentialConfiguration,
  userAgent: string,
  generateRequestId: () => string = randomUUID,
): Promise<SerializedRequest> {
  validateArgumentLocations(operation, args);
  const requestId = requestIdFromArguments(args, generateRequestId);
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": userAgent,
    ...(authenticationHeaders(credentials) as Record<string, string>),
  };
  for (const parameter of operation.parameters.filter((item) => item.in === "header")) {
    const value = args.headers?.[parameter.name];
    if (value === undefined || value === null) {
      if (parameter.required && parameter.name.toLowerCase() !== REQUEST_ID_HEADER) {
        throw new TransportSerializationError(`Missing required header ${parameter.name}`);
      }
      continue;
    }
    headers[parameter.name] = headerValue(parameter, value);
  }
  headers[REQUEST_ID_HEADER] = requestId;

  let body: string | FormData | undefined;
  const requestBody = operation.requestBody;
  if (requestBody !== null) {
    if (args.body === undefined && requestBody.required) {
      throw new TransportSerializationError(`${operation.operationId} requires a body`);
    }
    if (requestBody.mediaType === "application/json") {
      body = args.body === undefined ? undefined : JSON.stringify(args.body);
      headers["content-type"] = "application/json";
    } else {
      const schema = requestBody.schema;
      if (typeof schema === "boolean" || !isRecord(schema)) {
        throw new TransportSerializationError("Multipart request schema must be an object");
      }
      body =
        args.body === undefined ? undefined : await multipartBody(operation, schema, args.body);
    }
  }

  return {
    method: operation.method,
    path: serializePath(operation, args),
    query: serializeQuery(operation, args),
    headers,
    body,
    requestId,
  };
}

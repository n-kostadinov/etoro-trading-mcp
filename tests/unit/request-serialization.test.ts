import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CatalogOperation } from "../../src/catalog/types.js";
import catalog from "../../src/generated/tool-catalog.js";
import type { CredentialConfiguration } from "../../src/transport/credentials.js";
import {
  serializeRequest,
  TransportSerializationError,
} from "../../src/transport/request-serialization.js";

const credentials: CredentialConfiguration = {
  type: "apiKey",
  apiKey: "app-key",
  userKey: "user-key",
};
let temporaryDirectory: string;

function operation(operationId: string) {
  const found = catalog.operations.find((candidate) => candidate.operationId === operationId);
  if (found === undefined) {
    throw new Error(`Missing operation ${operationId}`);
  }
  return found;
}

function attachmentUpload(): CatalogOperation {
  // Mirrors the postAttachments operation as generated from the withdrawn
  // v1.400.0 Social Feeds surface: the multipart serializer must keep
  // supporting binary uploads should eToro reintroduce them.
  const fileProperty = {
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
    description:
      "Required. The image file to upload. Supported formats: JPEG and PNG. Maximum size: 8 MB (8,388,608 bytes), enforced server-side.",
  };
  const bodySchema = {
    properties: { file: fileProperty },
    required: ["file"],
    type: "object",
  };
  return {
    ...structuredClone(operation("postMoneyTransfer")),
    operationId: "postAttachments",
    method: "POST",
    path: "/api/v1/attachments",
    parameters: [
      {
        name: "x-request-id",
        in: "header",
        required: true,
        deprecated: false,
        description: "A unique request identifier.",
        style: "simple",
        explode: false,
        allowReserved: false,
        allowEmptyValue: false,
        schema: { format: "uuid", type: "string" },
      },
      {
        name: "client_request_id",
        in: "query",
        required: true,
        deprecated: false,
        description:
          "Client-generated correlation ID (UUID). Required for request tracing and idempotency.",
        style: "form",
        explode: true,
        allowReserved: false,
        allowEmptyValue: false,
        schema: { format: "uuid", type: "string" },
      },
    ],
    requestBody: {
      required: true,
      description: "",
      mediaType: "multipart/form-data",
      schema: bodySchema,
      hasBinary: true,
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: {
          type: "object",
          additionalProperties: false,
          properties: {
            client_request_id: { format: "uuid", type: "string" },
          },
          required: ["client_request_id"],
        },
        headers: {
          type: "object",
          additionalProperties: false,
          properties: {
            "x-request-id": { format: "uuid", type: "string" },
          },
        },
        body: bodySchema,
      },
      required: ["query", "body"],
    },
  } as CatalogOperation;
}

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(path.join(tmpdir(), "etoro-mcp-test-"));
});

afterEach(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

describe("request serialization", () => {
  it("serializes form arrays with explode=false and primitives with explode=true", async () => {
    const rates = await serializeRequest(
      operation("getRates"),
      { query: { instrumentIds: [1001, 1002] } },
      credentials,
      "test-agent",
    );
    expect(rates.query).toBe("instrumentIds=1001,1002");

    const search = await serializeRequest(
      operation("getMarketDataSearch"),
      { query: { fields: "name", pageSize: 2 } },
      credentials,
      "test-agent",
    );
    expect(search.query).toBe("pageSize=2&fields=name");
  });

  it("encodes path parameters into the fixed operation path", async () => {
    const candles = await serializeRequest(
      operation(
        "getMarketDataInstrumentsByInstrumentIdHistoryCandlesByDirectionByIntervalByCandlesCount",
      ),
      {
        path: { instrumentId: 101, direction: "asc", interval: "OneMinute", candlesCount: 20 },
      },
      credentials,
      "test-agent",
    );
    expect(candles.path).toBe(
      "/api/v1/market-data/instruments/101/history/candles/asc/OneMinute/20",
    );
    await expect(
      serializeRequest(
        operation(
          "getMarketDataInstrumentsByInstrumentIdHistoryCandlesByDirectionByIntervalByCandlesCount",
        ),
        { path: { instrumentId: 101, direction: "asc", interval: "OneMinute" } },
        credentials,
        "test-agent",
      ),
    ).rejects.toThrow(/Missing required path parameter candlesCount/u);
  });

  it("generates a request ID and accepts a valid caller-supplied UUID", async () => {
    const generated = await serializeRequest(
      operation("getRates"),
      {
        query: { instrumentIds: [1] },
      },
      credentials,
      "test-agent",
    );
    expect(generated.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    const suppliedId = "11111111-1111-4111-8111-111111111111";
    const supplied = await serializeRequest(
      operation("getRates"),
      { query: { instrumentIds: [1] }, headers: { "x-request-id": suppliedId } },
      credentials,
      "test-agent",
    );
    expect(supplied.headers["x-request-id"]).toBe(suppliedId);
    await expect(
      serializeRequest(
        operation("getRates"),
        { query: { instrumentIds: [1] }, headers: { "x-request-id": "not-a-uuid" } },
        credentials,
        "test-agent",
      ),
    ).rejects.toThrow(/x-request-id must be a UUID/u);
  });

  it("rejects unknown arguments and caller-supplied credential headers", async () => {
    await expect(
      serializeRequest(
        operation("getRates"),
        { query: { instrumentIds: [1], extra: "value" } },
        credentials,
        "test-agent",
      ),
    ).rejects.toThrow(/Unknown query argument extra/u);
    await expect(
      serializeRequest(
        operation("getRates"),
        { query: { instrumentIds: [1] }, headers: { "x-api-key": "forbidden" } },
        credentials,
        "test-agent",
      ),
    ).rejects.toThrow(/supplied by the server credential configuration/u);
  });

  it("serializes JSON bodies without endpoint-specific branches", async () => {
    const body = {
      action: "open",
      transaction: "buy",
      instrumentId: 1,
      orderType: "mkt",
      amount: 25,
    };
    const request = await serializeRequest(
      operation("createTradingExecutionDemoOrdersV3"),
      { body },
      credentials,
      "test-agent",
    );
    expect(request.body).toBe(JSON.stringify(body));
    expect(request.headers["content-type"]).toBe("application/json");
  });

  it("builds multipart uploads from validated local files", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const filePath = path.join(temporaryDirectory, "chart.png");
    await writeFile(filePath, png);
    const request = await serializeRequest(
      attachmentUpload(),
      {
        query: { client_request_id: "22222222-2222-4222-8222-222222222222" },
        body: { file: { filePath, fileName: "chart.png" } },
      },
      credentials,
      "test-agent",
    );
    expect(request.body).toBeInstanceOf(FormData);
    expect(request.query).toBe("client_request_id=22222222-2222-4222-8222-222222222222");
    await expect(
      serializeRequest(
        attachmentUpload(),
        {
          query: { client_request_id: "22222222-2222-4222-8222-222222222222" },
          body: { file: { filePath, contentType: "image/jpeg" } },
        },
        credentials,
        "test-agent",
      ),
    ).rejects.toThrow(/file content is image\/png/u);
    const textPath = path.join(temporaryDirectory, "not-an-image.txt");
    await writeFile(textPath, "plain text");
    await expect(
      serializeRequest(
        attachmentUpload(),
        {
          query: { client_request_id: "22222222-2222-4222-8222-222222222222" },
          body: { file: { filePath: textPath } },
        },
        credentials,
        "test-agent",
      ),
    ).rejects.toThrow(/PNG or JPEG/u);
    expect(await readFile(filePath)).toEqual(png);
  });

  it("rejects attachments larger than the 8 MiB upstream limit", async () => {
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const oversizedPath = path.join(temporaryDirectory, "oversized.png");
    await writeFile(oversizedPath, Buffer.concat([pngMagic, Buffer.alloc(8 * 1024 * 1024)]));
    await expect(
      serializeRequest(
        attachmentUpload(),
        {
          query: { client_request_id: "22222222-2222-4222-8222-222222222222" },
          body: { file: { filePath: oversizedPath } },
        },
        credentials,
        "test-agent",
      ),
    ).rejects.toThrow(/exceeds the 8 MiB attachment limit/u);
  });

  it("wraps serialization failures in a transport-specific error type", async () => {
    await expect(
      serializeRequest(operation("getRates"), {}, credentials, "test-agent"),
    ).rejects.toBeInstanceOf(TransportSerializationError);
  });
});

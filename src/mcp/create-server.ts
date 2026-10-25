import { randomUUID } from "node:crypto";
import { fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import { addFormats, AjvJsonSchemaValidator } from "@modelcontextprotocol/server/validators/ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { CatalogOperation } from "../catalog/types.js";
import {
  failedCallResult,
  type EtoroCallResult,
  type EtoroTransport,
  type ToolArguments,
} from "../transport/types.js";

const inputSchemaValidator = createInputSchemaValidator();

function createInputSchemaValidator(): AjvJsonSchemaValidator {
  const ajv = new Ajv2020({
    strict: false,
    validateSchema: false,
    allErrors: true,
  });
  addFormats(ajv);
  for (const format of ["decimal", "double", "float", "int16", "int32", "int64", "nullable"]) {
    ajv.addFormat(format, true);
  }
  return new AjvJsonSchemaValidator(ajv);
}

export interface CreateServerOptions {
  operations: CatalogOperation[];
  transport: EtoroTransport;
  version: string;
}

function callToolResult(result: EtoroCallResult) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    structuredContent: result,
    isError: !result.ok,
  };
}

function registerOperation(
  server: McpServer,
  operation: CatalogOperation,
  transport: EtoroTransport,
): void {
  server.registerTool(
    operation.operationId,
    {
      title: operation.annotations.title,
      description: operation.descriptionForTool,
      inputSchema: fromJsonSchema<ToolArguments>(operation.inputSchema, inputSchemaValidator),
      annotations: operation.annotations,
    },
    async (args, context) => {
      try {
        const result = await transport.execute(
          operation,
          (args ?? {}) as ToolArguments,
          context.mcpReq.signal,
        );
        return callToolResult(result);
      } catch (error) {
        return callToolResult(
          failedCallResult(operation.operationId, randomUUID(), {
            code: "invalid_response",
            message: `Unexpected local failure: ${error instanceof Error ? error.message : String(error)}`,
            retryAfterMs: null,
          }),
        );
      }
    },
  );
}

export function createMcpServer(options: CreateServerOptions): McpServer {
  const server = new McpServer({ name: "etoro-trading-mcp", version: options.version });
  for (const operation of options.operations) {
    registerOperation(server, operation, options.transport);
  }
  return server;
}
